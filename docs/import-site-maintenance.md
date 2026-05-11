# Import Site Maintenance

These notes are for agents maintaining the standalone import website and the
GitHub Action it triggers.

## Goal

Maintain a small GitHub Pages website that lets approved GitHub users submit a
paper formalization repo for import into the meta-library.

The page triggers a GitHub Actions workflow through GitHub's
`workflow_dispatch` REST API. The page must not contain a personal access
token, client secret, or any other private credential.

## Required User Flow

1. User opens the GitHub Pages import page.
2. User authenticates through GitHub OAuth device flow.
3. User enters the submitted paper repo details.
4. The page checks repository, branch, commit, and metadata through GitHub APIs.
5. The page calls the workflow dispatch endpoint for the import workflow.
6. The page shows whether dispatch succeeded and links to the workflow run if
   it can locate the run.
7. The GitHub Action checks whether `github.actor` is allowed.
8. The GitHub Action validates inputs, checks the submitted repo, and then
   proceeds with the import workflow.

## Website Requirements

Host the page with GitHub Pages. It can be plain HTML/CSS/JavaScript or a small
static frontend build, but the output must be static files.

The page must provide fields for:

- source repository URL
- source branch
- full 40-character commit hash
- metadata file path, default `metadata-meta-library.yaml`
- surface file path, normally read from metadata and defaulting to
  `Surface.lean`

The workflow also accepts optional usage feedback and usage lessons paths. The
UI may default these to empty until those controls are needed.

The page should validate before dispatch:

- source repository resolves to `owner/repo`
- branch contains only safe branch/path characters
- commit is a full 40-character hex SHA
- file paths contain only safe path characters
- optional paths may be empty

The page must show clear errors for:

- invalid form input
- OAuth/device-flow denial or expiration
- missing GitHub permissions
- failed workflow dispatch API call

The page should not claim that frontend validation is security. The real
security boundary is the GitHub Action.

## OAuth Requirement

Use GitHub OAuth device flow.

The static page may contain the OAuth app client ID. It must not contain a
client secret. The OAuth app must have device flow enabled in GitHub settings.

GitHub's device-flow endpoints do not support browser CORS preflight. Use the
small OAuth proxy in `oauth-proxy-worker.js`, and configure its allowed origin
to the GitHub Pages origin for this site.

The user token must have permission to trigger workflows in this import-site
repo and read the submitted paper repo. For private submitted repositories, the
OAuth scope normally needs `repo`.

## Workflow Dispatch Requirement

The page must call:

```text
POST https://api.github.com/repos/OWNER/REPO/actions/workflows/ingest-paper.yml/dispatches
```

The request body must use the default branch ref and the workflow inputs:

```json
{
  "ref": "main",
  "inputs": {
    "source_repository": "some-owner/some-paper-repo",
    "source_branch": "main",
    "source_commit": "0000000000000000000000000000000000000000",
    "metadata_path": "metadata-meta-library.yaml",
    "surface_path": "Surface.lean",
    "usage_feedback_path": "",
    "usage_lessons_path": ""
  }
}
```

Use these headers:

```text
Accept: application/vnd.github+json
Authorization: Bearer <user-access-token>
X-GitHub-Api-Version: 2022-11-28
```

## GitHub Action Requirements

Maintain `.github/workflows/ingest-paper.yml`.

The workflow must include:

- `on: workflow_dispatch`
- inputs matching the website fields
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

Do not put secrets in GitHub Pages.

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

This repository owns the import-site UI, workflow, allowlist, OAuth proxy, paper
preparation guide, and submission templates.
