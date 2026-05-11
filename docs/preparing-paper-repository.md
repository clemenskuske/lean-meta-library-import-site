# Preparing A Paper Repository

This import-site repository owns the agent-facing instructions for making a
paper formalization ready for import into `clemenskuske/lean-meta-library`.

## 1. Build A Normal Lean Package

The submitted paper repo must build without special local state.

Checklist:

- put Lean files under a clear module namespace
- add a root import file, for example `MyPaper.lean`
- add `lean-toolchain`
- add `lakefile.lean`
- run `lake update`
- run `lake build`
- commit `lean-toolchain`, `lakefile.lean`, `lake-manifest.json`, and sources
- do not commit `.lake/`

Lean can check an individual file directly with `lean File.lean`, but submitted
paper repos must still build as Lake packages because the meta-library imports
packages and depends on reproducible package metadata.

## 2. Create The Surface File

The surface file is a short, stable interface. It should not be a second proof
development.

Use:

```lean
import MyPaper

namespace MetaLibrary.MyPaperName

theorem theorem_name := MyPaper.Internal.theorem_name
def definition_name := MyPaper.Internal.definition_name

end MetaLibrary.MyPaperName
```

Do not use:

- `sorry`
- `admit`
- unapproved `axiom`
- unapproved `constant`
- new proof scripts
- broad internal imports when one root import is available

## 3. Create Metadata

Start from `templates/metadata-meta-library.yaml` in this repository.

Every exported item should connect:

- the stable Lean name
- the original Lean name in the paper repo
- the paper theorem/definition number or section
- natural-language search text
- statement dependencies
- proof dependencies, if known
- verification status

The metadata may cover multiple papers in one repo, but each paper submitted to
the meta-library needs its own metadata entry and eventual version folder.

Versions use the shape `v<generation><approach><update>`, for example `v1a1`.
The leading number identifies the paper-version generation, the letter
identifies a formalization approach, and the trailing number identifies updates
within that same approach. For example, `v1a2` updates approach `a`, while
`v1b1` is a different approach to the same generation. Different approaches can
be current at the same time.

## 4. Record Reuse Feedback

If this paper formalization tried to use existing meta-library paper versions,
create two submission files:

- `used-formalizations.json`: structured evaluations of each imported or tried
  formalization version
- `used-formalization-lessons.md`: longer notes that future agents should see
  when considering those older versions

This feedback is about previously imported formalizations, not about the new
paper version itself. Ingestion merges it into the referenced version folders
and updates lookup scores in `papers.csv`.

## 5. Submit A Pinned Commit

Never submit `latest main` implicitly. Submit:

- repo URL
- branch
- exact commit hash
- metadata file path
- surface file path
- reuse feedback file paths, if present

The pinned commit is the reproducible source of the accepted paper version.

## 6. What CI Checks

CI and the checker container validate:

- required files
- metadata fields
- pinned branch and commit
- `lake build`
- surface file resolution
- `sorry` and `admit`
- axiom whitelist compatibility
- theorem list shape
- reuse feedback target shape
- meta-library build after import

The axiom policy is whitelist-based. Exported theorems may depend on Lean or
mathlib basic axioms and on names listed in
`clemenskuske/lean-meta-library`'s `allowed-axioms.lean`. Everything else is
rejected. `sorryAx` is always rejected.
