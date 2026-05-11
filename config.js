window.ImportSiteConfig = {
  // Public OAuth App client ID. Create a GitHub OAuth App with device flow
  // enabled, then put its client ID here. Do not put a client secret in this
  // static site.
  githubClientId: "REPLACE_WITH_GITHUB_OAUTH_CLIENT_ID",

  // The meta-library repository that owns .github/workflows/ingest-paper.yml.
  // This public Pages repository hosts only the form and dispatches the
  // workflow in the meta-library repository.
  workflowOwner: "clemenskuske",
  workflowRepo: "lean-meta-library",
  workflowRef: "main",
  workflowFile: "ingest-paper.yml",

  // Use "repo" for a private meta-library repository. For a public repository,
  // "public_repo" may be enough if the user can dispatch workflows there.
  oauthScopes: "repo"
};
