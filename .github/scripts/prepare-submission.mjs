import fs from "node:fs";

const fieldLabels = {
  commit_url: "GitHub commit URL",
  metadata_path: "Metadata path",
  submission_permission: "Submission permission"
};

const requiredIssueCheckboxes = [
  "I am allowed to submit these results to the library.",
  "I take responsibility for this submission and confirm that it is meant only to document the formalization; it contains no hidden instructions, prompts, or content intended to mislead agents, harm people, or compromise systems."
];

const patterns = {
  repository: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
  branch: /^[A-Za-z0-9._/-]+$/,
  commit: /^[0-9a-fA-F]{40}$/,
  path: /^[A-Za-z0-9._/-]+$/
};

const githubApiBase = process.env.GITHUB_API_URL || "https://api.github.com";
const githubToken = process.env.GITHUB_TOKEN || process.env.SUBMISSION_READ_TOKEN || process.env.GH_TOKEN || "";

function fail(message) {
  fs.writeFileSync(".submission-error", message);
  console.error(message);
  process.exit(1);
}

function output(name, value) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function safePath(value, optional = false) {
  if (optional && value === "") return true;
  if (!patterns.path.test(value)) return false;
  if (value.startsWith("/") || value.endsWith("/")) return false;
  return !value.split("/").some((part) => part === "" || part === "." || part === "..");
}

function cleanIssueValue(value = "") {
  const cleaned = value
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  return cleaned === "_No response_" ? "" : cleaned;
}

function parseIssueBody(body) {
  const fields = {};
  const heading = /^###\s+(.+?)\s*$/gm;
  const matches = [...body.matchAll(heading)];
  for (let index = 0; index < matches.length; index += 1) {
    const label = matches[index][1].trim();
    const start = matches[index].index + matches[index][0].length;
    const end = matches[index + 1]?.index ?? body.length;
    fields[label] = cleanIssueValue(body.slice(start, end));
  }
  return fields;
}

function checkboxChecked(section, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^- \\[[xX]\\]\\s+${escaped}\\s*$`, "m").test(section || "");
}

function parseGitHubCommitUrl(value) {
  const trimmed = value.trim();
  let candidate = trimmed;
  if (/^github\.com\//i.test(candidate)) candidate = `https://${candidate}`;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("GitHub commit URL must be a valid github.com commit link.");
  }

  if (url.hostname.toLowerCase() !== "github.com") {
    throw new Error("GitHub commit URL must be on github.com.");
  }

  const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts.length !== 4 || parts[2] !== "commit") {
    throw new Error("GitHub commit URL must look like https://github.com/owner/repo/commit/<40-character-sha>.");
  }

  const repository = `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
  const commit = parts[3].toLowerCase();
  if (!patterns.repository.test(repository)) throw new Error("Commit URL repository must resolve to owner/repo form.");
  if (!patterns.commit.test(commit)) throw new Error("Commit URL must include a full 40-character hex SHA.");
  return { repository, commit };
}

async function githubApi(path, description) {
  const url = new URL(path, githubApiBase.endsWith("/") ? githubApiBase : `${githubApiBase}/`);
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "lean-meta-library-import-site"
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  let response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    throw new Error(`${description} failed: ${error.message}`);
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      detail = (await response.json()).message || detail;
    } catch {
      // Keep the status text if the response body is not JSON.
    }
    const error = new Error(`${description} failed: ${response.status} ${detail}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function chooseBranch(branches, defaultBranch) {
  const names = [...new Set(branches)].sort((left, right) => left.localeCompare(right));
  if (defaultBranch && names.includes(defaultBranch)) return defaultBranch;
  if (names.length === 1) return names[0];
  return "";
}

async function fetchAllBranches(repository) {
  const branches = [];
  for (let page = 1; page <= 10; page += 1) {
    const pageBranches = await githubApi(
      `/repos/${repository}/branches?per_page=100&page=${page}`,
      "Reading repository branches"
    );
    branches.push(...pageBranches);
    if (pageBranches.length < 100) break;
  }
  return branches;
}

async function branchContainsCommit(repository, commit, branchHeadSha) {
  if (branchHeadSha.toLowerCase() === commit) return true;
  const comparison = await githubApi(
    `/repos/${repository}/compare/${commit}...${branchHeadSha}`,
    "Checking whether a branch contains the submitted commit"
  );
  return comparison.status === "identical" || comparison.status === "ahead";
}

async function resolveSourceBranch(repository, commit) {
  await githubApi(`/repos/${repository}/commits/${commit}`, "Reading submitted commit");
  const repo = await githubApi(`/repos/${repository}`, "Reading repository metadata");
  const defaultBranch = repo.default_branch || "";
  const branches = await fetchAllBranches(repository);

  const headBranches = branches
    .filter((branch) => branch.commit?.sha?.toLowerCase() === commit)
    .map((branch) => branch.name);
  const exactBranch = chooseBranch(headBranches, defaultBranch);
  if (exactBranch) return exactBranch;

  const sortedBranches = [...branches].sort((left, right) => {
    if (left.name === defaultBranch) return -1;
    if (right.name === defaultBranch) return 1;
    return left.name.localeCompare(right.name);
  });

  const containingBranches = [];
  for (const branch of sortedBranches) {
    if (!branch.commit?.sha) continue;
    if (await branchContainsCommit(repository, commit, branch.commit.sha)) {
      if (branch.name === defaultBranch) return branch.name;
      containingBranches.push(branch.name);
    }
  }

  const containingBranch = chooseBranch(containingBranches, defaultBranch);
  if (containingBranch) return containingBranch;
  if (containingBranches.length > 1) {
    throw new Error(`Commit is contained in multiple branches (${containingBranches.join(", ")}), so the source branch is ambiguous.`);
  }
  throw new Error("Could not infer a source branch that contains the submitted commit.");
}

function issueSubmission(event) {
  const fields = parseIssueBody(event.issue?.body || "");
  const permissionSection = fields[fieldLabels.submission_permission] || "";
  for (const checkbox of requiredIssueCheckboxes) {
    if (!checkboxChecked(permissionSection, checkbox)) {
      fail(`Required checkbox is missing or unchecked: ${checkbox}`);
    }
  }
  return {
    source_commit_url: fields[fieldLabels.commit_url] || "",
    metadata_path: fields[fieldLabels.metadata_path] || ""
  };
}

function workflowDispatchSubmission(event) {
  const inputs = event.inputs || {};
  return {
    source_commit_url: inputs.source_commit_url || "",
    metadata_path: inputs.metadata_path || ""
  };
}

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const submission = event.inputs ? workflowDispatchSubmission(event) : issueSubmission(event);

let parsedCommit;
try {
  parsedCommit = parseGitHubCommitUrl(submission.source_commit_url);
} catch (error) {
  fail(error.message);
}

if (!safePath(submission.metadata_path)) fail("Metadata path must be a relative safe path.");

let sourceBranch;
try {
  sourceBranch = await resolveSourceBranch(parsedCommit.repository, parsedCommit.commit);
} catch (error) {
  fail(error.message);
}

if (!patterns.branch.test(sourceBranch)) fail("Resolved branch contains unsupported characters.");

output("source_repository", parsedCommit.repository);
output("source_branch", sourceBranch);
output("source_commit", parsedCommit.commit);
output("metadata_path", submission.metadata_path);

fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
  "## Parsed Import Submission",
  "",
  `- Commit URL: \`${submission.source_commit_url}\``,
  `- Repository: \`${parsedCommit.repository}\``,
  `- Branch: \`${sourceBranch}\``,
  `- Commit: \`${parsedCommit.commit}\``,
  `- Metadata: \`${submission.metadata_path}\``,
  "- Surface and optional reuse files: read from metadata",
  ""
].join("\n"));
