import fs from "node:fs";
import path from "node:path";

const requiredMetadataFields = [
  "paper_id",
  "paper_title",
  "surface_file",
  "source_repo_url",
  "source_branch",
  "online_source",
  "exported_items"
];

const patterns = {
  path: /^[A-Za-z0-9._/-]+$/
};

const ignoredScanDirs = new Set([".git", ".lake", "node_modules"]);
const scanTextExtensions = new Set([".csv", ".json", ".lean", ".md", ".toml", ".txt", ".yaml", ".yml"]);
const shortPaperExtensions = new Set([".md", ".txt", ".yaml", ".yml"]);
const shortPaperJsonFiles = new Set([
  "metadata-meta-library.json",
  "quality-metadata.json",
  "theorem-list.json",
  "token-usage.json",
  "used-formalizations.json",
  "usage-feedback.json"
]);
const paperFileLimit = { bytes: 256 * 1024, lines: 4000 };
const surfaceFileLimit = { bytes: 64 * 1024, lines: 1000 };

const suspiciousTextRules = [
  {
    message: "Possible SQL query or database mutation text",
    regex: /\b(?:select\s+[\s\S]{1,400}?\s+from|insert\s+into|update\s+[\w".-]+\s+set|delete\s+from|drop\s+(?:table|database|schema|view)|alter\s+table|create\s+(?:table|database|schema|view|user)|truncate\s+table|union\s+select|exec(?:ute)?\s+)\b/i
  },
  {
    message: "Possible prompt-injection instruction",
    regex: /\b(?:ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions|reveal\s+(?:the\s+)?system\s+prompt|developer\s+message|do\s+not\s+obey|forget\s+(?:all\s+)?instructions|prompt\s+injection|you\s+are\s+(?:chatgpt|codex|an?\s+ai|an?\s+agent))\b/i
  }
];

const leanNetworkRules = [
  {
    message: "Lean source invokes an external process",
    regex: /\bIO\.Process\.(?:run|output|spawn)\b/i
  },
  {
    message: "Lean source mentions a network command",
    regex: /\b(?:curl|wget|nc|netcat|ssh|scp|ftp|telnet)\b/i
  },
  {
    message: "Lean source mentions network client APIs",
    regex: /\b(?:Socket|WebSocket|TCP|HTTP|Http|Net\.)\b/
  }
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function safePath(value, optional = false) {
  if (optional && value === "") return true;
  if (!patterns.path.test(value)) return false;
  if (value.startsWith("/") || value.endsWith("/")) return false;
  return !value.split("/").some((part) => part === "" || part === "." || part === "..");
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

function parseGitHubRepository(value) {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) return trimmed.replace(/\.git$/i, "");

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (url.hostname.toLowerCase() !== "github.com") return undefined;
  const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts.length < 2) return undefined;
  return `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
}

function metadataOptionalFile(text, field) {
  const yamlSection = text.match(/^optional_files\s*:\s*\n((?:[ \t]+[A-Za-z0-9_-]+\s*:[^\n]*\n?)*)/m);
  const yamlMatch = yamlSection?.[1]?.match(new RegExp(`^[ \\t]+${field}\\s*:\\s*["']?([^"'\n#]+)`, "m"));
  if (yamlMatch?.[1]) return yamlMatch[1].trim();

  try {
    const json = JSON.parse(text);
    const value = json.optional_files?.[field];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function assertFile(root, relativePath, label) {
  if (!safePath(relativePath)) fail(`${label} must be a relative safe path.`);
  const absolutePath = path.join(root, relativePath);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) fail(`${label} escapes the submitted repository.`);
  const stat = fs.statSync(absolutePath, { throwIfNoEntry: false });
  if (!stat?.isFile()) fail(`${label} not found: ${relativePath}`);
}

function lineCount(text) {
  if (text.length === 0) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

function lineForIndex(text, index) {
  return text.slice(0, index).split(/\r\n|\r|\n/).length;
}

function readSubmissionText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertShortFile(root, relativePath, label, limit) {
  const absolutePath = path.join(root, relativePath);
  const stat = fs.statSync(absolutePath, { throwIfNoEntry: false });
  if (!stat?.isFile()) return `${label} not found: ${relativePath}`;
  if (stat.size > limit.bytes) {
    return `${label} is too large: ${relativePath} is ${stat.size} bytes, limit is ${limit.bytes} bytes.`;
  }
  const lines = lineCount(readSubmissionText(root, relativePath));
  if (lines > limit.lines) {
    return `${label} is too long: ${relativePath} has ${lines} lines, limit is ${limit.lines}.`;
  }
  return "";
}

function walkSubmissionFiles(root, directory = root) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!ignoredScanDirs.has(entry.name)) {
        files.push(...walkSubmissionFiles(root, path.join(directory, entry.name)));
      }
      continue;
    }
    if (entry.isFile()) {
      files.push(path.relative(root, path.join(directory, entry.name)).split(path.sep).join("/"));
    }
  }
  return files;
}

function shouldBeShortPaperFile(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  const basename = path.basename(relativePath);
  return shortPaperExtensions.has(extension) || shortPaperJsonFiles.has(basename);
}

function shouldScanText(relativePath) {
  return scanTextExtensions.has(path.extname(relativePath).toLowerCase()) || path.basename(relativePath) === "lakefile.lean";
}

function scanRuleSet(text, relativePath, rules) {
  const errors = [];
  for (const rule of rules) {
    const match = rule.regex.exec(text);
    if (match) errors.push(`${rule.message} in ${relativePath}:${lineForIndex(text, match.index)}.`);
  }
  return errors;
}

function validateRepositoryContent(root, surfacePath, extraShortPaths) {
  const errors = [];
  const shortPaths = new Set(extraShortPaths.filter(Boolean));
  for (const relativePath of walkSubmissionFiles(root)) {
    if (shouldBeShortPaperFile(relativePath)) shortPaths.add(relativePath);
  }
  shortPaths.add(surfacePath);

  for (const relativePath of shortPaths) {
    const limit = relativePath === surfacePath ? surfaceFileLimit : paperFileLimit;
    const error = assertShortFile(root, relativePath, "Paper-facing file", limit);
    if (error) errors.push(error);
  }

  for (const relativePath of walkSubmissionFiles(root)) {
    if (!shouldScanText(relativePath)) continue;
    const text = readSubmissionText(root, relativePath);
    errors.push(...scanRuleSet(text, relativePath, suspiciousTextRules));
    if (path.extname(relativePath).toLowerCase() === ".lean" && path.basename(relativePath) !== "lakefile.lean") {
      errors.push(...scanRuleSet(text, relativePath, leanNetworkRules));
    }
  }

  if (errors.length > 0) fail(errors.join("\n"));
}

const repoRoot = path.resolve("submitted-paper");
const metadataPath = process.env.METADATA_PATH || "";
const sourceBranch = process.env.SOURCE_BRANCH || "";
const sourceRepository = process.env.SOURCE_REPOSITORY || "";

assertFile(repoRoot, metadataPath, "Metadata file");
const metadataText = fs.readFileSync(path.join(repoRoot, metadataPath), "utf8");

const errors = [];
const warnings = [];
for (const field of requiredMetadataFields) {
  if (!metadataHasField(metadataText, field)) errors.push(`Missing required metadata field: ${field}.`);
}

if (!metadataHasField(metadataText, "orcid")) {
  warnings.push("ORCID is missing. That is allowed when unavailable.");
}

const metadataBranch = metadataValue(metadataText, "source_branch");
if (metadataBranch && metadataBranch !== sourceBranch) {
  errors.push("source_branch in metadata does not match the submitted branch.");
}

const metadataRepository = parseGitHubRepository(metadataValue(metadataText, "source_repo_url") || "");
if (sourceRepository && metadataRepository && metadataRepository.toLowerCase() !== sourceRepository.toLowerCase()) {
  errors.push("source_repo_url in metadata does not match the submitted commit URL repository.");
}

const metadataSurface = metadataValue(metadataText, "surface_file");
let surfacePath = "";
if (!metadataSurface) {
  errors.push("surface_file is missing from metadata.");
} else if (!safePath(metadataSurface)) {
  errors.push("surface_file must be a relative safe path.");
} else {
  surfacePath = metadataSurface;
}

if (errors.length > 0) fail(errors.join("\n"));

const usageFeedbackPath = metadataOptionalFile(metadataText, "used_formalizations") || "";
const usageLessonsPath = metadataOptionalFile(metadataText, "used_formalization_lessons") || "";

assertFile(repoRoot, surfacePath, "Surface file");
if (usageFeedbackPath) assertFile(repoRoot, usageFeedbackPath, "Usage feedback file");
if (usageLessonsPath) assertFile(repoRoot, usageLessonsPath, "Usage lessons file");

validateRepositoryContent(repoRoot, surfacePath, [metadataPath, usageFeedbackPath, usageLessonsPath]);

output("surface_path", surfacePath);
output("usage_feedback_path", usageFeedbackPath);
output("usage_lessons_path", usageLessonsPath);

fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
  "## Metadata Preflight",
  "",
  `- Metadata file found: \`${metadataPath}\``,
  `- Surface file found: \`${surfacePath}\``,
  usageFeedbackPath ? `- Usage feedback file found: \`${usageFeedbackPath}\`` : "- Usage feedback file: none",
  usageLessonsPath ? `- Usage lessons file found: \`${usageLessonsPath}\`` : "- Usage lessons file: none",
  "- Content guard passed: paper-facing files are short, SQL-like text is absent, and Lean source does not use network/process hooks",
  ...warnings.map((warning) => `- Warning: ${warning}`),
  ""
].join("\n"));
