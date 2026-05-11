window.ImportSiteConfig = {
  // Public OAuth App client ID. Do not put a client secret in this static site.
  githubClientId: "Ov23liYg4RU3Ble8slT6",

  // Browser fetches to github.com/login/device/code and
  // github.com/login/oauth/access_token are blocked by CORS. Set this to a
  // small OAuth proxy that forwards only those GitHub OAuth POSTs.
  oauthProxyBaseUrl: "",

  // The import controller repository that owns .github/workflows/ingest-paper.yml.
  // The workflow checks out the meta-library repository and performs the import work.
  workflowOwner: "clemenskuske",
  workflowRepo: "lean-meta-library-import-site",
  workflowRef: "main",
  workflowFile: "ingest-paper.yml",

  // Use "repo" for private repositories. For public repositories, "public_repo"
  // may be enough if the user can dispatch workflows there.
  oauthScopes: "repo"
};
