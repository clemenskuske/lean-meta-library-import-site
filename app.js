const config = window.ImportSiteConfig || {};

const patterns = {
  source_repository: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
  source_branch: /^[A-Za-z0-9._/-]+$/,
  source_commit: /^[0-9a-fA-F]{40}$/,
  path: /^[A-Za-z0-9._/-]+$/,
  shaish: /^[0-9a-fA-F]{7,40}$/
};

const requiredMetadataFields = [
  "paper_id",
  "paper_title",
  "surface_file",
  "source_repo_url",
  "source_branch",
  "source_commit",
  "online_source",
  "exported_items"
];

const state = {
  accessToken: "",
  authenticatedUser: "",
  polling: false,
  repository: null,
  branches: [],
  branch: "",
  branchLocked: false,
  commit: "",
  commitLocked: false,
  rootYamlFiles: [],
  metadataPath: "",
  surfacePath: "",
  metadataOk: false
};

const form = document.querySelector("#import-form");
const authButton = document.querySelector("#auth-button");
const dispatchButton = document.querySelector("#dispatch-button");
const message = document.querySelector("#message");
const authState = document.querySelector("#auth-state");
const targetRepo = document.querySelector("#target-repo");
const authStep = document.querySelector("#auth-step");
const repoStep = document.querySelector("#repo-step");
const repoUrlInput = document.querySelector("#repo-url");
const repoLookupButton = document.querySelector("#repo-lookup-button");
const repoSummary = document.querySelector("#repo-summary");
const branchStep = document.querySelector("#branch-step");
const branchSelectWrap = document.querySelector("#branch-select-wrap");
const branchSelect = document.querySelector("#branch-select");
const branchDisplay = document.querySelector("#branch-display");
const commitDisplay = document.querySelector("#commit-display");
const metadataStep = document.querySelector("#metadata-step");
const metadataPathInput = document.querySelector("#metadata-path");
const metadataCheckButton = document.querySelector("#metadata-check-button");
const yamlChoices = document.querySelector("#yaml-choices");
const metadataSummary = document.querySelector("#metadata-summary");
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

function setStep(element, visible) {
  element.hidden = !visible;
}

function markField(field, ok) {
  field?.setAttribute("aria-invalid", ok ? "false" : "true");
}

function safePath(value, optional = false) {
  if (optional && value === "") return true;
  if (!patterns.path.test(value)) return false;
  if (value.startsWith("/") || value.endsWith("/")) return false;
  return !value.split("/").some((part) => part === "" || part === "." || part === "..");
}

function workflowInputs() {
  return {
    source_repository: `${state.repository.owner}/${state.repository.name}`,
    source_branch: state.branch,
    source_commit: state.commit,
    metadata_path: state.metadataPath,
    surface_path: state.surfacePath,
    usage_feedback_path: "",
    usage_lessons_path: ""
  };
}

function validateInputs(inputs) {
  const errors = [];
  if (!patterns.source_repository.test(inputs.source_repository)) {
    errors.push("Paper repository must use owner/repo form.");
  }
  if (!patterns.source_branch.test(inputs.source_branch)) {
    errors.push("Branch contains unsupported characters.");
  }
  if (!patterns.source_commit.test(inputs.source_commit)) {
    errors.push("Commit hash must be a full 40-character hex SHA.");
  }
  if (!safePath(inputs.metadata_path)) {
    errors.push("Metadata path must be a relative safe path.");
  }
  if (!safePath(inputs.surface_path)) {
    errors.push("Surface path must be a relative safe path.");
  }
  return errors;
}

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${state.accessToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra
  };
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
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return body;
}

function oauthEndpoint(path) {
  const proxy = (config.oauthProxyBaseUrl || "").trim().replace(/\/+$/, "");
  if (!proxy) {
    throw new Error("Set oauthProxyBaseUrl in config.js. GitHub's OAuth device endpoints do not allow direct browser fetches from a static page.");
  }
  return `${proxy}${path}`;
}

function oauthFetchMessage(error) {
  if (error instanceof TypeError) {
    return "The OAuth request could not be completed. Check oauthProxyBaseUrl and its CORS settings.";
  }
  return error.message || String(error);
}

async function oauthJson(path, params) {
  return githubJson(oauthEndpoint(path), {
    method: "POST",
    body: params
  });
}

async function beginDeviceFlow() {
  if (!config.githubClientId || config.githubClientId === "REPLACE_WITH_GITHUB_OAUTH_CLIENT_ID") {
    throw new Error("Set githubClientId in config.js before using OAuth.");
  }

  const params = new URLSearchParams({
    client_id: config.githubClientId,
    scope: config.oauthScopes || "repo"
  });

  return oauthJson("/login/device/code", params);
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

    const body = await oauthJson("/login/oauth/access_token", params);

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
      headers: authHeaders()
    });

    state.authenticatedUser = user.login || "";
    authState.textContent = state.authenticatedUser ? `Authenticated: ${state.authenticatedUser}` : "Authenticated";
    authState.classList.add("is-good");
    devicePanel.hidden = true;
    setStep(authStep, false);
    setStep(repoStep, true);
    repoUrlInput.focus();
    setMessage("GitHub authentication complete. Paste the paper repository URL to continue.", "is-good");
  } catch (error) {
    state.accessToken = "";
    setMessage(oauthFetchMessage(error), "is-error");
  } finally {
    state.polling = false;
    authButton.disabled = false;
    dispatchButton.disabled = !state.metadataOk;
  }
}

function parseGitHubRepoUrl(value) {
  const trimmed = value.trim();
  if (patterns.source_repository.test(trimmed)) {
    const [owner, repo] = trimmed.split("/");
    return { owner, repo: repo.replace(/\.git$/i, ""), path: [] };
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2], path: [] };
  }

  let candidate = trimmed;
  if (/^github\.com\//i.test(candidate)) candidate = `https://${candidate}`;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://github.com/${candidate}`;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Enter a GitHub repository URL, for example https://github.com/owner/repo.");
  }

  if (url.hostname.toLowerCase() !== "github.com") {
    throw new Error("The repository URL must be on github.com.");
  }

  const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts.length < 2) {
    throw new Error("Enter a GitHub repository URL, for example https://github.com/owner/repo.");
  }

  return {
    owner: parts[0],
    repo: parts[1].replace(/\.git$/i, ""),
    path: parts.slice(2)
  };
}

function matchBranchFromPath(pathParts, branches) {
  const branchNames = branches.map((branch) => branch.name).sort((a, b) => b.length - a.length);
  const joined = pathParts.join("/");
  return branchNames.find((name) => joined === name || joined.startsWith(`${name}/`)) || "";
}

function fixedRefFromUrlPath(path, branches) {
  const kind = path[0];
  if (kind === "commit" && path[1]) {
    return { commitRef: path[1], commitLocked: true };
  }

  if ((kind === "tree" || kind === "blob") && path.length > 1) {
    const rest = path.slice(1);
    const branch = matchBranchFromPath(rest, branches);
    if (branch) {
      return { branch, branchLocked: true };
    }
    if (patterns.shaish.test(rest[0])) {
      return { commitRef: rest[0], commitLocked: true };
    }
    return { branch: rest[0], branchLocked: true };
  }

  return {};
}

async function fetchBranches(owner, repo) {
  const branches = await githubJson(
    `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
    { headers: authHeaders({ Accept: "application/vnd.github+json" }) }
  );
  return Array.isArray(branches) ? branches : [];
}

async function resolveCommit(owner, repo, ref) {
  const commit = await githubJson(
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
    { headers: authHeaders({ Accept: "application/vnd.github+json" }) }
  );
  const sha = commit.sha || "";
  if (!patterns.source_commit.test(sha)) throw new Error("GitHub did not return a full commit SHA.");
  return sha;
}

async function fetchRootYamlFiles(owner, repo, ref) {
  const contents = await githubJson(
    `https://api.github.com/repos/${owner}/${repo}/contents?ref=${encodeURIComponent(ref)}`,
    { headers: authHeaders({ Accept: "application/vnd.github+json" }) }
  );
  if (!Array.isArray(contents)) return [];
  return contents
    .filter((item) => item.type === "file" && /\.ya?ml$/i.test(item.name || ""))
    .map((item) => item.path)
    .sort((a, b) => a.localeCompare(b));
}

async function fetchTextFile(owner, repo, path, ref) {
  const item = await githubJson(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
    { headers: authHeaders({ Accept: "application/vnd.github+json" }) }
  );
  if (item.type !== "file" || !item.content) throw new Error("GitHub did not return a file.");
  const binary = atob(String(item.content).replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function renderBranchChoices() {
  branchSelect.replaceChildren();
  for (const branch of state.branches) {
    const option = document.createElement("option");
    option.value = branch.name;
    option.textContent = branch.name;
    branchSelect.append(option);
  }

  branchSelect.value = state.branch;
  branchDisplay.textContent = state.branch || "Choose a branch";
  branchSelectWrap.hidden = state.branchLocked;
}

function renderYamlChoices() {
  yamlChoices.replaceChildren();
  if (state.rootYamlFiles.length === 0) {
    const empty = document.createElement("span");
    empty.className = "quiet";
    empty.textContent = "No root-level YAML files found. Type the metadata path.";
    yamlChoices.append(empty);
    return;
  }

  for (const path of state.rootYamlFiles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-chip";
    button.textContent = path;
    button.addEventListener("click", () => {
      metadataPathInput.value = path;
      void validateMetadataPath();
    });
    yamlChoices.append(button);
  }
}

function resetAfterRepositoryChange() {
  state.repository = null;
  state.branches = [];
  state.branch = "";
  state.branchLocked = false;
  state.commit = "";
  state.commitLocked = false;
  state.rootYamlFiles = [];
  state.metadataPath = "";
  state.surfacePath = "";
  state.metadataOk = false;
  repoSummary.textContent = "";
  metadataSummary.textContent = "";
  commitDisplay.value = "";
  dispatchButton.disabled = true;
  setStep(branchStep, false);
  setStep(metadataStep, false);
  setResult("Ready", "Authenticate, resolve the repository, choose metadata, then dispatch the import.");
}

async function chooseBranch(branch, keepLockedCommit = false) {
  state.branch = branch;
  branchDisplay.textContent = branch;
  state.metadataOk = false;
  dispatchButton.disabled = true;
  metadataSummary.textContent = "";

  if (!keepLockedCommit) {
    state.commit = await resolveCommit(state.repository.owner, state.repository.name, branch);
  }
  commitDisplay.value = state.commit;
  state.rootYamlFiles = await fetchRootYamlFiles(state.repository.owner, state.repository.name, state.commit);
  renderYamlChoices();
  setStep(metadataStep, true);
  setMessage("Branch and commit are ready. Choose the metadata YAML path.", "is-good");
}

async function resolveRepository() {
  resetAfterRepositoryChange();
  markField(repoUrlInput, true);
  repoLookupButton.disabled = true;
  setMessage("Looking up the repository on GitHub...");

  try {
    const parsed = parseGitHubRepoUrl(repoUrlInput.value);
    const repo = await githubJson(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
      { headers: authHeaders({ Accept: "application/vnd.github+json" }) }
    );

    const branches = await fetchBranches(parsed.owner, parsed.repo);
    const fixed = fixedRefFromUrlPath(parsed.path, branches);
    const defaultBranch = repo.default_branch || branches[0]?.name || "main";

    state.repository = {
      owner: parsed.owner,
      name: parsed.repo,
      htmlUrl: repo.html_url || `https://github.com/${parsed.owner}/${parsed.repo}`
    };
    state.branches = branches.length > 0 ? branches : [{ name: defaultBranch }];
    state.branch = fixed.branch || defaultBranch;
    state.branchLocked = Boolean(fixed.branchLocked);
    state.commitLocked = Boolean(fixed.commitLocked);
    state.commit = fixed.commitRef
      ? await resolveCommit(parsed.owner, parsed.repo, fixed.commitRef)
      : await resolveCommit(parsed.owner, parsed.repo, state.branch);

    repoSummary.textContent = `${state.repository.owner}/${state.repository.name}`;
    commitDisplay.value = state.commit;
    renderBranchChoices();
    setStep(branchStep, true);

    await chooseBranch(state.branch, state.commitLocked);
  } catch (error) {
    markField(repoUrlInput, false);
    if (error.status === 404) {
      setMessage("Repository not found. Check the URL and that your GitHub account has access.", "is-error");
      setResult("Repository not found", "The GitHub API could not find that repository for the authenticated account.");
    } else {
      setMessage(error.message || String(error), "is-error");
      setResult("Repository unresolved", "Fix the repository URL before continuing.");
    }
  } finally {
    repoLookupButton.disabled = false;
  }
}

function metadataHasField(text, field) {
  if (field === "exported_items") {
    return new RegExp(`^${field}\\s*:`, "m").test(text) && /stable_lean_name\s*:|lean_name\s*:/m.test(text);
  }
  return new RegExp(`^${field}\\s*:\\s*\\S+`, "m").test(text)
    || new RegExp(`"${field}"\\s*:\\s*`, "m").test(text);
}

function metadataValue(text, field) {
  const yamlMatch = text.match(new RegExp(`^${field}\\s*:\\s*["']?([^"'\n#]+)`, "m"));
  if (yamlMatch?.[1]) return yamlMatch[1].trim();

  try {
    const json = JSON.parse(text);
    const value = json[field];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function collectMetadataProblems(text, path) {
  const errors = [];
  const warnings = [];
  for (const field of requiredMetadataFields) {
    if (!metadataHasField(text, field)) errors.push(`Missing required metadata field: ${field}.`);
  }

  if (!metadataHasField(text, "orcid")) {
    warnings.push("ORCID is missing. That is allowed when unavailable.");
  }

  const metadataCommit = metadataValue(text, "source_commit");
  if (metadataCommit && !patterns.source_commit.test(metadataCommit)) {
    errors.push("source_commit must be a full 40-character Git commit hash.");
  } else if (metadataCommit && metadataCommit.toLowerCase() !== state.commit.toLowerCase()) {
    errors.push("source_commit in the metadata does not match the selected commit.");
  }

  const metadataBranch = metadataValue(text, "source_branch");
  if (metadataBranch && metadataBranch !== state.branch) {
    errors.push("source_branch in the metadata does not match the selected branch.");
  }

  const surface = metadataValue(text, "surface_file");
  if (surface && !safePath(surface)) {
    errors.push("surface_file must be a relative safe path.");
  }

  if (!safePath(path)) {
    errors.push("Metadata path must be a relative safe path.");
  }

  return { errors, warnings, surface };
}

async function validateMetadataPath() {
  if (!state.repository || !state.commit) {
    setMessage("Resolve a repository before choosing metadata.", "is-error");
    return;
  }

  const path = metadataPathInput.value.trim();
  markField(metadataPathInput, safePath(path));
  state.metadataOk = false;
  dispatchButton.disabled = true;
  metadataCheckButton.disabled = true;
  metadataSummary.textContent = "";
  setMessage("Checking the metadata file...");

  try {
    if (!safePath(path)) throw new Error("Metadata path must be a relative safe path.");
    const text = await fetchTextFile(state.repository.owner, state.repository.name, path, state.commit);
    const { errors, warnings, surface } = collectMetadataProblems(text, path);
    if (errors.length > 0) throw new Error(errors[0]);

    await fetchTextFile(state.repository.owner, state.repository.name, surface, state.commit);
    state.metadataPath = path;
    state.surfacePath = surface;
    state.metadataOk = true;
    metadataSummary.textContent = warnings.length > 0
      ? `Metadata is usable. Surface file: ${surface}. ${warnings[0]}`
      : `Metadata is usable. Surface file: ${surface}.`;
    dispatchButton.disabled = false;
    setMessage("Metadata validated. Ready to dispatch the import.", "is-good");
    setResult("Ready to dispatch", `${state.repository.owner}/${state.repository.name} at ${state.commit.slice(0, 12)} will be submitted.`);
  } catch (error) {
    markField(metadataPathInput, false);
    setMessage(error.status === 404 ? "Metadata or surface file not found at the selected commit." : error.message || String(error), "is-error");
    setResult("Metadata needs attention", "Choose another YAML file or update the metadata in the source repository.");
  } finally {
    metadataCheckButton.disabled = false;
  }
}

async function findRecentRun(target, dispatchStartedAt) {
  const url = `https://api.github.com/repos/${target.owner}/${target.repo}/actions/workflows/${target.file}/runs?event=workflow_dispatch&branch=${encodeURIComponent(target.ref)}&per_page=10`;
  const body = await githubJson(url, {
    headers: authHeaders({ Accept: "application/vnd.github+json" })
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
  const inputs = state.repository ? workflowInputs() : {};
  const errors = state.repository && state.metadataOk ? validateInputs(inputs) : ["Resolve the repository and validate metadata before dispatching."];

  if (!target.owner || !target.repo) {
    errors.push("Configure workflowOwner and workflowRepo in config.js, or serve this from a GitHub project Pages URL.");
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
      headers: authHeaders({
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      }),
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
    setResult("Dispatch failed", "Check repository access, Actions permissions, token permissions, and workflow input values.", workflowPage);
  } finally {
    dispatchButton.disabled = !state.metadataOk;
  }
}

function initialize() {
  const target = workflowTarget();
  targetRepo.textContent = target.owner && target.repo
    ? `${target.owner}/${target.repo} @ ${target.ref}`
    : "Configure config.js";
  dispatchButton.disabled = true;
  setStep(repoStep, false);
  setStep(branchStep, false);
  setStep(metadataStep, false);
  form.addEventListener("submit", dispatchWorkflow);
  authButton.addEventListener("click", authenticate);
  repoLookupButton.addEventListener("click", resolveRepository);
  repoUrlInput.addEventListener("input", resetAfterRepositoryChange);
  repoUrlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void resolveRepository();
    }
  });
  branchSelect.addEventListener("change", () => {
    state.branchLocked = false;
    state.commitLocked = false;
    void chooseBranch(branchSelect.value);
  });
  metadataCheckButton.addEventListener("click", validateMetadataPath);
  metadataPathInput.addEventListener("input", () => {
    state.metadataOk = false;
    dispatchButton.disabled = true;
    metadataSummary.textContent = "";
    markField(metadataPathInput, true);
  });
  metadataPathInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void validateMetadataPath();
    }
  });
}

initialize();
