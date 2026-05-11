# Lean Meta-library Import Site

This repository is the import controller for
`clemenskuske/lean-meta-library`: a GitHub Issue Form plus the GitHub Actions
workflow that validates submitted paper repositories.

Agent-facing requirements for acceptable paper repositories live in
`AGENTS.md`.

Paper-preparation and import-controller documentation:

- `docs/preparing-paper-repository.md`
- `docs/import-flow.md`
- `docs/checker-container.md`
- `docs/import-site-maintenance.md`
- `templates/`

## Setup

1. Enable Issues for this public repository. The import form lives at
   `.github/ISSUE_TEMPLATE/import-paper.yml`.
2. Enable GitHub Pages if you want the landing page. The included Pages workflow
   deploys the repository root and links to the issue form.
3. Add a repository secret named `META_LIBRARY_PUSH_TOKEN`. Use a fine-grained
   token or GitHub App token with contents read/write access to
   `clemenskuske/lean-meta-library`.
4. If submitted paper repositories may be private and are not readable by that
   token, add `SUBMISSION_READ_TOKEN` with read access to those repositories.

The import form uses GitHub's normal issue UI, so submitters must be signed in
with a GitHub account. The workflow still checks `github.actor` against
`.github/import-allowed-users.txt`; frontend or issue-form validation is not the
security boundary.

The workflow itself uses `META_LIBRARY_PUSH_TOKEN` for the cross-repository
checkout and later push into `clemenskuske/lean-meta-library`. Do not put this
token in the static site or issue form.

## Manual Test Checklist

- Open the GitHub import issue form and confirm it asks for repo URL, branch,
  full commit hash, metadata path, and submission permission.
- Submit a malformed test issue and confirm the workflow comments with a parse
  or validation error.
- Submit as an unauthorized GitHub user and confirm the workflow comments with
  an allowlist failure before any submitted repo checkout.
- Submit a known pinned paper repo commit and confirm the workflow checks out
  that exact commit, reads metadata-declared paths, runs the checker, builds the
  meta-library, and comments the result on the issue.
