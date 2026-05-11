const config = window.ImportSiteConfig || {};

const patterns = {
  source_repository: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
  source_branch: /^[A-Za-z0-9._/-]+$/,
  source_commit: /^[0-9a-fA-F]{40}$/,
  path: /^[A-Za-z0-9._/-]+$/
};

const state = {
  accessToken: "",
  authenticatedUser: "",
  polling: false
};

const form = document.querySelector("#import-form");
const authButton = document.querySelector("#auth-button");
const dispatchButton = document.querySelector("#dispatch-button");
const message = document.querySelector("#message");
const authState = document.querySelector("#auth-state");
const targetRepo = document.querySelector("#target-repo");
const devicePanel = document.querySelector("#device-panel");
const deviceCode = document.querySelector("#device-code");
const deviceLink = document.querySelector("#device-link");
const resultTitle = document.querySelector("#result-title");
const resultCopy = document.querySelector("#result-copy");
const runLink = document.querySelector("#run-link");

function inferWorkflowTarget() {
  const owner = (config.workflowOwner || "").trim();
  const repo = (config.workflowRepo || "").trim();
  if (owner && repo) return { owner, repo };

  const githubPagesMatch = window.location.hostname.match(/^([A-Za-z0-9-]+)\.github\.io$/);
  const pathRepo = window.location.pathname.split("/").filter(Boolean)[0];
  if (githubPagesMatch && pathRepo) {
    return { owner: githubPagesMatch[1], repo: pathRepo };
  }

  return { owner: "", repo: "" };
}

function workflowTarget() {
  const inferred = inferWorkflowTarget();
  return {
    owner: inferred.owner,
    repo: inferred.repo,
    ref: config.workflowRef || "main",
    file: config.workflowFile || "ingest-paper.yml"
  };
}

function setMessage(text, kind = "") {
  message.textContent = text;
  message.className = `message ${kind}`.trim();
}

function setResult(title, copy, href = "") {
  resultTitle.textContent = title;
  resultCopy.textContent = copy;
  if (href) {
    runLink.href = href;
    runLink.hidden = false;
  } else {
    runLink.hidden = true;
  }
}

function safePath(value, optional = false) {
  if (optional && value === "") return true;
  if (!patterns.path.test(value)) return false;
  if (value.startsWith("/") || value.endsWith("/")) return false;
  return !value.split("/").some((part) => part === "" || part === "." || part === "..");
}

function collectInputs() {
  const data = Object.fromEntries(new FormData(form).entries());
  return {
    source_repository: String(data.source_repository || "").trim(),
    source_branch: String(data.source_branch || "").trim(),
    source_commit: String(data.source_commit || "").trim(),
    metadata_path: String(data.metadata_path || "").trim(),
    surface_path: String(data.surface_path || "").trim(),
    usage_feedback_path: String(data.usage_feedback_path || "").trim(),
    usage_lessons_path: String(data.usage_lessons_path || "").trim()
  };
}

function validateInputs(inputs) {
  const errors = [];
  const mark = (name, ok, error) => {
    const field = form.elements[name];
    field?.setAttribute("aria-invalid", ok ? "false" : "true");
    if (!ok) errors.push(error);
  };

  mark("source_repository", patterns.source_repository.test(inputs.source_repository), "Paper repository must use owner/repo form.");
  mark("source_branch", patterns.source_branch.test(inputs.source_branch), "Branch contains unsupported characters.");
  mark("source_commit", patterns.source_commit.test(inputs.source_commit), "Commit hash must be a full 40-character hex SHA.");
  mark("metadata_path", safePath(inputs.metadata_path), "Metadata path must be a relative safe path.");
  mark("surface_path", safePath(inputs.surface_path), "Surface path must be a relative safe path.");
  mark("usage_feedback_path", safePath(inputs.usage_feedback_path, true), "Usage feedback path must be empty or a relative safe path.");
  mark("usage_lessons_path", safePath(inputs.usage_lessons_path, true), "Usage lessons path must be empty or a relative safe path.");

  return errors;
}

async function githubJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    const detail = body.error_description || body.message || response.statusText;
    throw new Error(detail);
  }
  return body;
}

async function beginDeviceFlow() {
  if (!config.githubClientId || config.githubClientId === "REPLACE_WITH_GITHUB_OAUTH_CLIENT_ID") {
    throw new Error("Set githubClientId in site/config.js before using OAuth.");
  }

  const params = new URLSearchParams({
    client_id: config.githubClientId,
    scope: config.oauthScopes || "repo"
  });

  return githubJson("https://github.com/login/device/code", {
    method: "POST",
    body: params
  });
}

async function pollForToken(device) {
  const started = Date.now();
  let interval = Number(device.interval || 5);

  while (Date.now() - started < Number(device.expires_in || 900) * 1000) {
    await new Promise((resolve) => window.setTimeout(resolve, interval * 1000));

    const params = new URLSearchParams({
      client_id: config.githubClientId,
      device_code: device.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    });

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: params
    });
    const body = await response.json();

    if (body.access_token) return body.access_token;
    if (body.error === "authorization_pending") continue;
    if (body.error === "slow_down") {
      interval += 5;
      continue;
    }
    if (body.error === "expired_token") throw new Error("The GitHub device code expired.");
    if (body.error === "access_denied") throw new Error("GitHub authorization was denied.");
    throw new Error(body.error_description || body.error || "GitHub device authorization failed.");
  }

  throw new Error("The GitHub device code expired.");
}

async function authenticate() {
  if (state.polling) return;
  state.polling = true;
  authButton.disabled = true;
  dispatchButton.disabled = true;
  setMessage("Requesting a GitHub device code...");

  try {
    const device = await beginDeviceFlow();
    deviceCode.textContent = device.user_code;
    deviceLink.href = device.verification_uri || "https://github.com/login/device";
    devicePanel.hidden = false;
    setMessage("Enter the code on GitHub. This page will continue when authorization completes.");

    state.accessToken = await pollForToken(device);
    const user = await githubJson("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${state.accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    state.authenticatedUser = user.login || "";
    authState.textContent = state.authenticatedUser ? `Authenticated: ${state.authenticatedUser}` : "Authenticated";
    authState.classList.add("is-good");
    devicePanel.hidden = true;
    setMessage("GitHub authentication complete.", "is-good");
  } catch (error) {
    state.accessToken = "";
    setMessage(error.message || String(error), "is-error");
  } finally {
    state.polling = false;
    authButton.disabled = false;
    dispatchButton.disabled = false;
  }
}

async function findRecentRun(target, dispatchStartedAt) {
  const url = `https://api.github.com/repos/${target.owner}/${target.repo}/actions/workflows/${target.file}/runs?event=workflow_dispatch&branch=${encodeURIComponent(target.ref)}&per_page=10`;
  const body = await githubJson(url, {
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  const started = dispatchStartedAt.getTime() - 10000;
  return (body.workflow_runs || []).find((run) => {
    const created = new Date(run.created_at).getTime();
    const actor = run.actor?.login;
    return created >= started && (!state.authenticatedUser || actor === state.authenticatedUser);
  });
}

async function dispatchWorkflow(event) {
  event.preventDefault();
  const target = workflowTarget();
  const inputs = collectInputs();
  const errors = validateInputs(inputs);

  if (!target.owner || !target.repo) {
    errors.push("Configure workflowOwner and workflowRepo in site/config.js, or serve this from a GitHub project Pages URL.");
  }
  if (!state.accessToken) {
    errors.push("Authenticate with GitHub before dispatching the workflow.");
  }
  if (errors.length > 0) {
    setMessage(errors[0], "is-error");
    setResult("Not dispatched", `${errors.length} validation issue(s) need attention.`);
    return;
  }

  dispatchButton.disabled = true;
  setMessage("Dispatching the import workflow...");
  setResult("Dispatching", "GitHub accepted the request only if your token can trigger this workflow.");

  const dispatchStartedAt = new Date();
  const endpoint = `https://api.github.com/repos/${target.owner}/${target.repo}/actions/workflows/${target.file}/dispatches`;
  const workflowPage = `https://github.com/${target.owner}/${target.repo}/actions/workflows/${target.file}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${state.accessToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        ref: target.ref,
        inputs
      })
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.json();
        detail = body.message || detail;
      } catch {
        detail = await response.text();
      }
      throw new Error(detail || "Workflow dispatch failed.");
    }

    let run = null;
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      run = await findRecentRun(target, dispatchStartedAt);
    } catch {
      run = null;
    }

    setMessage("Workflow dispatch succeeded.", "is-good");
    if (run?.html_url) {
      setResult("Dispatch succeeded", "The newest matching workflow run is available on GitHub.", run.html_url);
    } else {
      setResult("Dispatch succeeded", "GitHub returned success. Open the workflow page to find the new run.", workflowPage);
    }
  } catch (error) {
    const text = error.message || String(error);
    setMessage(text, "is-error");
    setResult("Dispatch failed", "Check repository access, Actions permissions, OAuth scopes, and workflow input values.", workflowPage);
  } finally {
    dispatchButton.disabled = false;
  }
}

function initialize() {
  const target = workflowTarget();
  targetRepo.textContent = target.owner && target.repo
    ? `${target.owner}/${target.repo} @ ${target.ref}`
    : "Configure site/config.js";
  form.addEventListener("input", () => validateInputs(collectInputs()));
  form.addEventListener("submit", dispatchWorkflow);
  authButton.addEventListener("click", authenticate);
}

initialize();
