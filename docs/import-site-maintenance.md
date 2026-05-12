# Import Site Maintenance

These notes are for agents maintaining the GitHub Issue Form and the GitHub
Action it triggers.

## Goal

Maintain a GitHub Issue Form and workflow that let signed-in, approved GitHub
users submit a paper formalization repo for import into the meta-library.

The issue form triggers a GitHub Actions workflow through the `issues` event.
The repository may also keep `workflow_dispatch` for manual maintainer runs.
No issue form or workflow input should contain a personal access token, client
secret, or any other private credential.

## Required User Flow

1. User opens the GitHub import issue form.
2. GitHub requires the user to be signed in before submitting the form.
3. User enters the submitted paper repo details.
4. The GitHub Action checks whether `github.actor` is allowed.
5. The workflow parses and validates the issue fields.
6. The workflow comments acceptance, validation failures, or success on the
   issue.
7. The GitHub Action validates inputs, checks the submitted repo, and then
   proceeds with the import workflow.
8. Successful issue submissions are closed automatically after the import PR is
   opened or updated.

## Issue Form Requirements

The canonical submission UI is `.github/ISSUE_TEMPLATE/import-paper.yml`.
GitHub controls the visual styling; keep fields clear and stable because the
workflow parser reads the issue body headings.

The issue form must provide fields for:

- GitHub commit URL for the exact submitted commit
- metadata file path, default `metadata-meta-library.yaml`
- confirmation that the submitter is allowed to submit the results to the
  library
- confirmation that the submitter takes responsibility for the submitted
  content and has not included hidden prompts, misleading agent instructions,
  harmful content, or content intended to compromise systems

The workflow reads the surface file path and optional usage feedback paths from
metadata.

The workflow should validate before checking out submitted code:

- source repository resolves to `owner/repo`
- branch resolved from GitHub contains only safe branch/path characters
- commit URL contains a full 40-character hex SHA
- metadata path contains only safe path characters
- metadata-declared surface and optional paths contain only safe path
  characters
- required issue-form checkboxes are checked
- paper-facing files are short enough to review
- submitted text does not contain SQL-like queries or common prompt-injection
  phrases
- Lean source does not invoke external processes or network/client APIs

The workflow must comment clear errors for:

- invalid form input
- unauthorized GitHub actor
- missing import-site secrets
- failed submitted-repository checkout or validation

Failed submissions should remain open so the submitter can edit the issue and
rerun validation.

The issue form should not claim that form validation is security. The real
security boundary is the GitHub Action.

## GitHub Authentication Requirement

Use GitHub Issues for authentication. A public repository issue form can be
submitted by signed-in GitHub users without making them repository members.
The workflow must still authorize `github.actor` against
`.github/import-allowed-users.txt` before checking out submitted code.

## Workflow Trigger Requirements

The primary trigger is:

```text
issues.opened, issues.edited, issues.reopened
```

The workflow should ignore issues that do not carry the `import-submission`
label or the `Import paper:` title prefix. Keep `workflow_dispatch` inputs as a
manual maintainer fallback if useful.

## GitHub Action Requirements

Maintain `.github/workflows/ingest-paper.yml`.

The workflow must include:

- `on: issues`
- optional `on: workflow_dispatch` for manual maintainer runs
- issue parser outputs matching the form fields
- commit URL parsing that derives `source_repository`, `source_branch`, and
  `source_commit`
- an authorization job that checks `github.actor`
- an input validation step before checkout or import work
- a submitted-repo checkout pinned to `source_commit`
- checker container execution or equivalent validation
- meta-library build after import changes

The workflow must read allowed GitHub users from:

```text
.github/import-allowed-users.txt
```

The allowlist should contain one username per line. The check should be
case-insensitive.

Unauthorized users must fail immediately with a clear message.

## Security Rules

Do not put secrets in issue templates.

Do not trust issue-form validation.

Do not trust workflow inputs as shell code.

Do not check out a submitted branch by name when a pinned commit is available.
The import must use the exact submitted commit hash.

Validate at least:

- commit URL matches `https://github.com/<owner>/<repo>/commit/<40-char-sha>`
- `source_repository` matches `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`
- resolved `source_branch` matches `^[A-Za-z0-9._/-]+$`
- `source_commit` matches `^[0-9a-fA-F]{40}$`
- metadata and metadata-declared surface/feedback paths match
  `^[A-Za-z0-9._/-]+$`
- paper-facing files stay below the configured size and line-count limits
- submitted text is rejected when it contains common SQL query/mutation
  patterns or common prompt-injection language
- Lean files are rejected when they use external process hooks, network command
  names, or network/client API markers

The workflow should treat submitted repo contents as untrusted until the checker
has passed.

## Main Repo Files Used By The Workflow

These files remain in `clemenskuske/lean-meta-library`:

- `scripts/check-submission.ts`
- `containers/submission-checker/Dockerfile`
- `allowed-axioms.lean`
- `schemas/`

This repository owns the import issue form, workflow, allowlist, paper
preparation guide, and submission templates.
