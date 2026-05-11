# Codex Readme

This repository is the import controller for the structural graph theory Lean
meta-library. Its point of view is submission and ingestion: help a user or
agent prepare a paper repository, validate that it is import-ready, and dispatch
the GitHub Action that checks a pinned commit.

The accepted Lean surfaces and catalog data do not live here. They live in the
main meta-library repository, `clemenskuske/lean-meta-library`.

## Read First

Before changing behavior, read:

- `AGENTS.md`
- `docs/preparing-paper-repository.md`
- `docs/import-flow.md`
- `docs/import-site-maintenance.md`
- `templates/README.md`

Those files are the authoritative local guidance for candidate paper
repositories and for the import-site workflow. If they disagree with older notes
in the main Lean repo, prefer this repository for import-preparation rules.

## Mental Model

There are three different repositories in the full system:

- a submitted paper repo, which contains the complete Lean formalization of one
  paper or paper bundle;
- this import-site repo, which contains the GitHub Issue Form submission UI,
  import workflow, allowlist, paper-preparation docs, and candidate templates;
- the main meta-library repo, which stores accepted surfaces, accepted metadata,
  `papers.csv`, schemas, and the checker/importer implementation.

This repo is therefore not the library. It is the front door and import
controller.

## What Belongs Here

Keep these things here:

- `.github/ISSUE_TEMPLATE/import-paper.yml` for the structured GitHub
  authenticated import form;
- `index.html` and `styles.css` for the GitHub Pages landing page that links to
  the issue form;
- `.github/workflows/ingest-paper.yml`, the workflow dispatch target;
- `.github/workflows/pages.yml`, the static site deployment workflow;
- `.github/import-allowed-users.txt`, one approved GitHub username per line;
- `docs/`, especially paper-repo preparation and import-site maintenance;
- `templates/`, the files a candidate paper repo should copy or imitate.

Do not put accepted paper surfaces, `papers.csv`, catalog storage, checker
source code, or in-library version folders here. Those belong in the main
meta-library repo.

## Import Flow

The user submits through the GitHub Issue Form. GitHub requires sign-in before
issue creation, so `github.actor` identifies the submitter. The workflow parses
the submitted repository, branch, pinned commit, and metadata file from the
issue body. Surface and optional reuse-feedback paths are read from metadata,
then the workflow validates the pinned submission.

The static landing page and issue form must never contain a client secret,
personal access token, or cross-repo push token.

Real authorization happens in GitHub Actions. The workflow checks
`github.actor` against `.github/import-allowed-users.txt` before checking out
submitted code. Treat frontend validation as usability only, not as a security
boundary.

The workflow:

- validates dispatch inputs;
- checks out `clemenskuske/lean-meta-library`;
- checks out the submitted paper repo at the exact 40-character commit hash;
- builds the checker container from the main meta-library repo;
- runs the checker against the submitted repo;
- runs the importer in the main meta-library checkout;
- updates `lake-manifest.json`;
- installs Lean and runs `lake build`;
- pushes `import/<paper-id>/<version-id>` to the main meta-library repo;
- opens or updates a pull request for review.

## Candidate Paper Repo Rules

A submitted paper repo must be a normal reproducible Lean/Lake package with:

- `lean-toolchain`;
- `lakefile.lean`;
- `lake-manifest.json`;
- a root import file such as `MyPaper.lean`;
- source files under a clear namespace directory;
- no committed `.lake/`.

It must build with `lake build`.

The submitted surface file, usually `Surface.lean`, is the import boundary. It
should import the paper package and expose aliases only:

```lean
import MyPaper

namespace MetaLibrary.MyPaper

theorem main_result := MyPaper.Internal.main_result

end MetaLibrary.MyPaper
```

The surface file should contain no new proof scripts, `sorry`, `admit`,
unapproved `axiom`, or unapproved `constant`. Stable exported names should look
like `MetaLibrary.<PaperName>.<localName>`.

The metadata file is normally `metadata-meta-library.yaml`. Required fields
include `paper_id`, `paper_title`, `surface_file`, `source_repo_url`,
`source_branch`, `source_commit`, `online_source`, and `exported_items`. ORCID is
recommended when available.

Versions use `v<generation><approach><update>`, for example `v1a1`. `v1a2`
updates approach `a`; `v1b1` is a different approach to the same paper
generation.

## Reuse Feedback

Two note streams must stay separate:

- `hard-earned-lessons.md` describes the new formalization being submitted;
- `used-formalizations.json` and `used-formalization-lessons.md` describe older
  meta-library versions that this new paper repo tried to use.

During ingestion, reuse feedback is merged into the targeted older version
folders in the main meta-library as `usage-feedback.json` and
`downstream-hard-earned-lessons.md`.

## Static Site Maintenance

The landing page is plain HTML and CSS. There is no local build step. The actual
submission form is GitHub-rendered from `.github/ISSUE_TEMPLATE/import-paper.yml`.

Useful local smoke check:

```bash
python3 -m http.server
```

Then open the served page and confirm it links to the import issue form.

When editing `.github/scripts/prepare-submission.mjs`, preserve these guardrails:

- accept GitHub repo URLs but normalize to `owner/repo`;
- require a full 40-character commit hash before dispatch;
- reject unsafe paths, absolute paths, empty path parts, `.`, and `..`;
- keep optional usage-feedback paths empty unless the UI grows controls for
  them;
- parse only the GitHub issue form fields or explicit manual
  `workflow_dispatch` inputs.

## Cross-Repo Boundary

If a task asks for import-site UI, issue form submission, workflow dispatch,
allowlists, submission templates, or paper-preparation instructions, work here.

If a task asks for accepted surfaces, `papers.csv`, schema changes, checker
implementation, axiom policy, Lake build behavior, or catalog storage, switch to
the main meta-library repo.

If a task touches both, keep the direction clear: this repo initiates and
documents import; the main repo validates, stores, and exposes accepted data.
