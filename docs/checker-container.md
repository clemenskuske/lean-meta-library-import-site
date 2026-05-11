# Checker Container

The checker container validates a submitted paper repo before its surface file
is copied into `clemenskuske/lean-meta-library`.

The Dockerfile and checker implementation currently live in the main
meta-library repository:

```text
clemenskuske/lean-meta-library
  containers/submission-checker/Dockerfile
  scripts/check-submission.ts
```

Build from a checkout of the main repo:

```bash
docker build -f containers/submission-checker/Dockerfile -t meta-library-submission-checker .
```

Run:

```bash
docker run --rm \
  -v /path/to/paper-repo:/submission \
  meta-library-submission-checker \
  --repo /submission \
  --metadata metadata-meta-library.yaml \
  --surface Surface.lean \
  --usage-feedback used-formalizations.json \
  --usage-lessons used-formalization-lessons.md \
  --json
```

The output is JSON:

```json
{
  "ok": false,
  "errors": [
    {
      "severity": "error",
      "code": "missing_metadata_field",
      "message": "Missing required metadata field: paper_title.",
      "path": "metadata-meta-library.yaml"
    }
  ],
  "warnings": []
}
```

The first version uses text checks for `sorry`, `admit`, `axiom`, and
`constant`, plus structured checks for optional usage feedback. A later version
should add a Lean-native theorem audit that runs `#print axioms` or an
equivalent environment traversal for every exported name, then rejects every
axiom dependency not present in the whitelist.
