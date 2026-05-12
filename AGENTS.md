# Agent Readme

This file is for agents creating paper repositories for the structural graph
theory meta-library import workflow.

This import-site repository is the home for paper-repository preparation
instructions, submission templates, and the import workflow. The Lean
meta-library repository stores accepted surfaces and catalog data; when guidance
here and guidance in the Lean repo disagree, treat this file and
`docs/preparing-paper-repository.md` as authoritative for making a paper repo
ready to import.

See also:

- `docs/preparing-paper-repository.md`
- `docs/import-flow.md`
- `templates/`

## What A Paper Repo Must Provide

A paper repo is the complete Lean formalization of one paper or one coherent
paper bundle. It must be reproducible from a pinned GitHub commit.

Required package files:

- `lean-toolchain`
- `lakefile.lean`
- `lake-manifest.json`
- one root import file, for example `MyPaper.lean`
- Lean source files under a clear namespace directory, for example `MyPaper/`

Required submission files:

- `Surface.lean`, or a metadata field naming the equivalent surface file
- `metadata-meta-library.yaml`
- theorem metadata listing exported definitions and theorems
- surface usage notes connecting Lean statements to the paper

Optional but encouraged files:

- `hard-earned-lessons.md`
- `used-formalizations.json`
- `used-formalization-lessons.md`
- `quality-metadata.json`
- token usage metadata
- design notes from the formalization

## Surface File Rules

The surface file is the import boundary. It should import the paper package and
export aliases only.

Good shape:

```lean
import MyPaper

namespace MetaLibrary.MyPaper

theorem main_result := MyPaper.Internal.main_result

end MetaLibrary.MyPaper
```

Rules:

- no new proofs
- no `sorry`
- no `admit`
- no unapproved `axiom`
- no unapproved `constant`
- no imports of files that rely on unfinished proofs or non-whitelisted axioms
- names should be stable, searchable, and paper-scoped
- exported names should look like `MetaLibrary.<PaperId>.<localName>`

Use `Surface.lean` unless the metadata explicitly gives a better name. In human
text, call it the surface file or export surface.

## Metadata Requirements

`metadata-meta-library.yaml` must include:

- `paper_id`
- `paper_title`
- `surface_file`
- `source_repo_url`
- `source_branch`
- `online_source`, such as an arXiv URL or DOI URL
- `orcid`, if available
- `exported_items`
- relation between each Lean statement and paper statement
- notes for agents about how to use the surface

The paper id should be stable and file-system safe: lowercase words separated by
hyphens in metadata, with a corresponding Lean namespace name in PascalCase.

Version ids should use `v<generation><approach><update>`, for example `v1a1`.
The leading number identifies the paper-version generation, the letter
identifies a formalization approach, and the trailing number identifies updates
within that same approach. For example, `v1a2` updates approach `a`, while
`v1b1` is a different approach to the same generation.

## Submission Feedback Files

There are two different note streams.

`hard-earned-lessons.md` belongs to the formalization being submitted. It is
written by the agent that created this paper's Lean code and explains design
decisions, failed approaches, and useful proof tricks inside this formalization.

`used-formalizations.json` and `used-formalization-lessons.md` belong to a new
paper repo that tried to use older meta-library versions. They are submission
inputs; the import workflow decides how to merge them into accepted
meta-library state.
