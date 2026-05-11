# Import Flow

This repository owns the import controller: the GitHub Issue Form, the workflow
target, and the instructions for making a submitted paper repo import-ready.
The accepted Lean surfaces and catalog data live in
`clemenskuske/lean-meta-library`.

## 1. Paper Repo Exists

A paper is formalized in its own GitHub repo. The repo is a valid Lean/Lake
package with `lean-toolchain`, `lakefile.lean`, `lake-manifest.json`, source
files, and a root import file. It builds independently with `lake build`.

## 2. Surface File Is Prepared

The paper repo contains `Surface.lean` or an equivalent export file named in
metadata. This file imports the paper package and contains only aliases for
selected definitions and theorems.

The surface file contains no new proofs and no `sorry`. Exported theorem axiom
audits must contain only Lean/mathlib basic axioms and names listed in
`clemenskuske/lean-meta-library`'s `allowed-axioms.lean`. Stable names should
look like `MetaLibrary.PaperName.localTheoremName`.

Versions use the shape `v<generation><approach><update>`, for example `v1a1`.
The leading number identifies the paper-version generation, the letter
identifies a formalization approach, and the trailing number identifies updates
within that same approach. For example, `v1a2` updates approach `a`, while
`v1b1` is a different approach to the same generation. More than one approach
can be current.

## 3. Metadata Is Prepared

The submission must provide `metadata-meta-library.yaml`. It may describe
multiple papers, but ingestion creates one version folder per paper.

Required information:

- paper title
- surface file name
- paper identifier
- source repo URL
- branch
- arXiv, DOI, or other online source
- ORCID if available
- exported definitions and theorems
- relation between Lean statements and paper statements
- surface-level usage notes
- website-facing paper-to-surface connection data

Optional information:

- agent report or design notes
- quality or reliability metadata
- token usage metadata
- `used-formalizations.json`, reporting older meta-library versions tried while
  creating this paper
- `used-formalization-lessons.md`, longer notes about using those older versions

## 4. Submission Happens

The user submits the paper repo URL, branch, full commit hash, and metadata
path. The surface file and optional reuse-feedback files are read from metadata.
The system must never import latest `main` implicitly.

The submission form is hosted as a GitHub Issue Form in this import-site
repository. Opening an issue requires a signed-in GitHub user, and the workflow
runs from the `issues` event. The landing page only links to the issue form and
does not contain tokens or OAuth code.

The real authorization still happens in the workflow. The workflow checks
`github.actor` against `.github/import-allowed-users.txt` before checking out or
importing submitted code.

## 5. CI Checks The Paper Repo

The checker should produce short structured errors that the frontend can
display.

It checks:

- GitHub username allowlist
- dispatch input shape
- required files
- metadata fields
- full commit hash
- `lake build`
- surface file resolution
- `sorry` and `admit`
- axiom whitelist compatibility
- theorem list shape
- optional usage feedback shape

## 6. Version Folder Is Created

If checks pass, ingestion creates this shape in `clemenskuske/lean-meta-library`:

```text
MetaLibrary/Papers/<paper-id>/v<number><letter><number>/
  Surface.lean
  theorem-list.json
  surface-readme.md
  hard-earned-lessons.md
  usage-feedback.json
  downstream-hard-earned-lessons.md
  quality-metadata.json
```

It also updates:

```text
MetaLibrary/Papers/<paper-id>/paper-meta.json
MetaLibrary/Papers/<paper-id>.lean
MetaLibrary/Papers.lean
papers.csv
```

## 7. Meta-Library Is Rebuilt

The full meta-library is built before merge. One broken paper-version should
not poison imports for future agents.

After the import branch is pushed and the pull request is opened or updated,
the import-site workflow comments on the submission issue and closes it as
completed. Failed submissions remain open for correction.

## 8. Lookup Data Is Updated

`papers.csv` is the agent lookup table. It tells an agent which papers exist,
which versions exist, which versions are current, where the surface file and
theorem metadata live, where the source repo lives, and the current quality and
reuse state.

During import, feedback from `used-formalizations.json` updates the targeted
older version folders and aggregate reuse columns in `papers.csv`.
