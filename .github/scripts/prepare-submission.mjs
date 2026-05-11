import fs from "node:fs";

const fieldLabels = {
  repo_url: "GitHub repository URL",
  branch: "Branch",
  commit_hash: "Pinned commit hash",
  metadata_path: "Metadata path"
};

const patterns = {
  repository: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
  branch: /^[A-Za-z0-9._/-]+$/,
  commit: /^[0-9a-fA-F]{40}$/,
  path: /^[A-Za-z0-9._/-]+$/
};

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

function parseGitHubRepository(value) {
  const trimmed = value.trim();
  if (patterns.repository.test(trimmed)) {
    const [owner, repo] = trimmed.split("/");
    return `${owner}/${repo.replace(/\.git$/i, "")}`;
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;

  let candidate = trimmed;
  if (/^github\.com\//i.test(candidate)) candidate = `https://${candidate}`;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://github.com/${candidate}`;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("GitHub repository URL must be a GitHub URL or owner/repo.");
  }

  if (url.hostname.toLowerCase() !== "github.com") {
    throw new Error("GitHub repository URL must be on github.com.");
  }

  const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts.length < 2) {
    throw new Error("GitHub repository URL must include owner and repository name.");
  }

  return `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
}

function issueSubmission(event) {
  const fields = parseIssueBody(event.issue?.body || "");
  return {
    source_repository: fields[fieldLabels.repo_url] || "",
    source_branch: fields[fieldLabels.branch] || "",
    source_commit: fields[fieldLabels.commit_hash] || "",
    metadata_path: fields[fieldLabels.metadata_path] || ""
  };
}

function workflowDispatchSubmission(event) {
  const inputs = event.inputs || {};
  return {
    source_repository: inputs.source_repository || "",
    source_branch: inputs.source_branch || "",
    source_commit: inputs.source_commit || "",
    metadata_path: inputs.metadata_path || ""
  };
}

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const submission = event.inputs ? workflowDispatchSubmission(event) : issueSubmission(event);

let normalizedRepository;
try {
  normalizedRepository = parseGitHubRepository(submission.source_repository);
} catch (error) {
  fail(error.message);
}

if (!patterns.repository.test(normalizedRepository)) fail("Paper repository must use owner/repo form.");
if (!patterns.branch.test(submission.source_branch)) fail("Branch contains unsupported characters.");
if (!patterns.commit.test(submission.source_commit)) fail("Commit hash must be a full 40-character hex SHA.");
if (!safePath(submission.metadata_path)) fail("Metadata path must be a relative safe path.");

output("source_repository", normalizedRepository);
output("source_branch", submission.source_branch);
output("source_commit", submission.source_commit.toLowerCase());
output("metadata_path", submission.metadata_path);

fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
  "## Parsed Import Submission",
  "",
  `- Repository: \`${normalizedRepository}\``,
  `- Branch: \`${submission.source_branch}\``,
  `- Commit: \`${submission.source_commit.toLowerCase()}\``,
  `- Metadata: \`${submission.metadata_path}\``,
  "- Surface and optional reuse files: read from metadata",
  ""
].join("\n"));
