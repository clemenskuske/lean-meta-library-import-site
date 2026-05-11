import fs from "node:fs";
import path from "node:path";

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

const patterns = {
  commit: /^[0-9a-fA-F]{40}$/,
  path: /^[A-Za-z0-9._/-]+$/
};

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

const repoRoot = path.resolve("submitted-paper");
const metadataPath = process.env.METADATA_PATH || "";
const sourceBranch = process.env.SOURCE_BRANCH || "";
const sourceCommit = (process.env.SOURCE_COMMIT || "").toLowerCase();

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

const metadataCommit = metadataValue(metadataText, "source_commit");
if (metadataCommit && !patterns.commit.test(metadataCommit)) {
  errors.push("source_commit must be a full 40-character Git commit hash.");
} else if (metadataCommit && metadataCommit.toLowerCase() !== sourceCommit) {
  errors.push("source_commit in metadata does not match the submitted commit.");
}

const metadataBranch = metadataValue(metadataText, "source_branch");
if (metadataBranch && metadataBranch !== sourceBranch) {
  errors.push("source_branch in metadata does not match the submitted branch.");
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
  ...warnings.map((warning) => `- Warning: ${warning}`),
  ""
].join("\n"));
