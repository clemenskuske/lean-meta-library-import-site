# Import Site Maintenance

These notes are for agents maintaining the standalone import website and the
GitHub Action it triggers.

## Goal

Maintain a GitHub Issue Form and workflow that let signed-in, approved GitHub
users submit a paper formalization repo for import into the meta-library.

The issue form triggers a GitHub Actions workflow through the `issues` event.
The repository may also keep `workflow_dispatch` for manual maintainer runs.
No public page should contain a personal access token, client secret, or any
other private credential.

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

## Issue Form Requirements

The canonical submission UI is `.github/ISSUE_TEMPLATE/import-paper.yml`.
GitHub controls the visual styling; keep fields clear and stable because the
workflow parser reads the issue body headings.

The issue form must provide fields for:

- source repository URL
- source branch
- full 40-character commit hash
- metadata file path, default `metadata-meta-library.yaml`
- surface file path, normally read from metadata and defaulting to
  `Surface.lean`

The workflow also accepts optional usage feedback and usage lessons paths.

The workflow should validate before checking out submitted code:

- source repository resolves to `owner/repo`
- branch contains only safe branch/path characters
- commit is a full 40-character hex SHA
- file paths contain only safe path characters
- optional paths may be empty

The workflow must comment clear errors for:

- invalid form input
- unauthorized GitHub actor
- missing import-site secrets
- failed submitted-repository checkout or validation

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
- issue parser outputs matching the import fields
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

Do not put secrets in GitHub Pages or issue templates.

Do not trust frontend validation.

Do not trust workflow inputs as shell code.

Do not check out a submitted branch by name when a pinned commit is available.
The import must use the exact submitted commit hash.

Validate at least:

- `source_repository` matches `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`
- `source_branch` matches `^[A-Za-z0-9._/-]+$`
- `source_commit` matches `^[0-9a-fA-F]{40}$`
- metadata/surface/feedback paths match `^[A-Za-z0-9._/-]+$`

The workflow should treat submitted repo contents as untrusted until the checker
has passed.

## Main Repo Files Used By The Workflow

These files remain in `clemenskuske/lean-meta-library`:

- `scripts/check-submission.ts`
- `containers/submission-checker/Dockerfile`
- `allowed-axioms.lean`
- `schemas/`

This repository owns the import issue form, landing page, workflow, allowlist,
paper preparation guide, and submission templates.
