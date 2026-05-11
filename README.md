# Lean Meta-library Import Site

This repository is the import controller for
`clemenskuske/lean-meta-library`: a static GitHub Pages UI plus the GitHub
Actions workflow that validates submitted paper repositories.

Agent-facing requirements for acceptable paper repositories live in
`AGENTS.md`.

## Setup

1. Set the target workflow repository in `config.js`. For the normal hosted
   import flow, this should point at `clemenskuske/lean-meta-library-import-site`.
2. Enable GitHub Pages for this repository. The included Pages workflow deploys
   the repository root.
3. Add a repository secret named `META_LIBRARY_PUSH_TOKEN`. Use a fine-grained
   token or GitHub App token with contents read/write access to
   `clemenskuske/lean-meta-library`.
4. If submitted paper repositories may be private and are not readable by that
   token, add `SUBMISSION_READ_TOKEN` with read access to those repositories.

The static site must never contain a personal access token or other private
credential. Users paste a GitHub token into the page when they dispatch an
import; the token is kept only in browser memory while the page is open.

The browser token must be able to read the submitted paper repository and
dispatch `.github/workflows/ingest-paper.yml` in this import-site repository.
For private repositories, a classic token generally needs the `repo` scope; a
fine-grained token needs suitable repository access and Actions permission.

The workflow itself uses `META_LIBRARY_PUSH_TOKEN` for the cross-repository
checkout and later push into `clemenskuske/lean-meta-library`. Do not put this
token in the static site.

## Manual Test Checklist

- Load the Pages URL and confirm the target workflow shows the import-site
  repository.
- Confirm the first visible step asks for a GitHub token and the dispatch
  button is disabled.
- Authenticate with a token from a GitHub account that can dispatch workflows in
  the import-site repository.
- Submit an invalid repo URL and confirm the page reports that the repo cannot
  be found or resolved.
- Submit a known paper repo URL and confirm the branch is shown, the latest
  branch commit is filled, and root-level YAML files are offered when present.
- Choose or type the metadata path and confirm the surface file path is read
  from metadata before dispatch is enabled.
- Dispatch a known pinned paper repo commit.
- Confirm `.github/workflows/ingest-paper.yml` starts in this import-site repo.
- Confirm an unauthorized GitHub user fails in the first workflow job.
- Confirm a malformed input fails before the submitted repo checkout.
- Confirm a valid submission runs the checker and then builds the meta-library
  from `clemenskuske/lean-meta-library`.
