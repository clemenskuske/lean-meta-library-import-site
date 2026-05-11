# Lean Meta-library Import Site

This repository is a static GitHub Pages import UI for dispatching
`clemenskuske/lean-meta-library/.github/workflows/ingest-paper.yml`.

## Setup

1. Create a GitHub OAuth App.
2. Enable device flow in that OAuth App.
3. Set the callback URL to the GitHub Pages URL for this site.
4. Copy the public OAuth client ID into `config.js`.
5. Enable GitHub Pages for this repository. The included Pages workflow deploys
   the repository root.

The static site may contain the OAuth client ID. It must never contain a client
secret, personal access token, or other private credential.

## Manual Test Checklist

- Load the Pages URL and confirm the target workflow shows the meta-library
  repository.
- Submit an invalid repo, branch, SHA, and path to confirm client-side errors.
- Authenticate with a GitHub account that can dispatch workflows in the
  meta-library repository.
- Dispatch a known pinned paper repo commit.
- Confirm `.github/workflows/ingest-paper.yml` starts.
- Confirm an unauthorized GitHub user fails in the first workflow job.
- Confirm a malformed input fails before the submitted repo checkout.
- Confirm a valid submission runs the checker and then builds the meta-library.
