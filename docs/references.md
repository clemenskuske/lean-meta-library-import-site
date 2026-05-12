# References

These are the external references used by the import flow and paper-preparation
rules.

- Lean Lake reference manual:
  https://lean-lang.org/doc/reference/latest/Build-Tools-and-Distribution/Lake/
  Lake workspaces conventionally include `lean-toolchain`, `lakefile.lean` or
  `lakefile.toml`, `lake-manifest.json`, and a `.lake/` build directory. The
  import rules require committing the first three and not committing `.lake/`.

- Lean axiom reference:
  https://lean-lang.org/doc/reference/latest/Axioms/
  Lean provides `#print axioms` for auditing direct and transitive axiom
  dependencies. The checker should reject every dependency outside the
  whitelist, with `sorryAx` always rejected.

- Lean 4 Lake README:
  https://github.com/leanprover/lean4/blob/master/src/lake/README.md
  Lake is distributed with Lean and uses package configuration files at the
  package root.

- Mathlib repository:
  https://github.com/leanprover-community/mathlib4
  Mathlib is the main Lean mathematics library. Submitted graph theory papers
  will usually depend on mathlib, but accepted surfaces should still expose
  stable paper-scoped names.

- Mathlib as dependency:
  https://github.com/leanprover-community/mathlib4/wiki/Using-mathlib4-as-a-dependency
  Paper repos that use mathlib should pin compatible Lean and mathlib versions
  through their Lake setup and committed manifest.

- GitHub issue forms:
  https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/configuring-issue-templates-for-your-repository
  The import site uses a structured issue form so GitHub handles sign-in and
  issue creation.

- GitHub Actions issues event:
  https://docs.github.com/en/actions/reference/events-that-trigger-workflows#issues
  The import workflow runs when an import-submission issue is opened, edited, or
  reopened.

- GitHub Actions `github.actor` context:
  https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
  The import workflow uses `github.actor` to check the submitter against the
  allowlist.
