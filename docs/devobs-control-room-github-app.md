# Devobs Control Room GitHub App

The Control Room reads the Devobs source catalog and can audit GitHub repositories linked to a SaaS organization. Repository audits use short-lived GitHub App installation tokens with read permissions. A repair proposal creates a new branch and a draft pull request; it never merges or deploys.

## Create and configure the GitHub App

Create a GitHub App for this SaaS and configure:

- Repository permissions: Contents: Read and write, Pull requests: Read and write, and Workflows: Read and write.
- Account permissions: none.
- Subscribe to no webhooks; this integration does not use webhooks.
- User authorization callback URL: https://<saas-host>/api/github-app/oauth/callback.
- Setup URL: https://<saas-host>/api/github-app/callback.
- Enable Redirect on update so permission changes return to the setup URL.
- Install it only on the GitHub account or organization whose repositories the SaaS organization intends to connect.

GitHub requires Workflows: Read and write to create files under .github/workflows. This is the only additional repository permission needed for the approved automated shared-CI repair. The dashboard still fails closed and leaves repairs unavailable until the installation confirms this permission.

The GitHub user authorization step is required before the SaaS saves an installation ID. It verifies that the signed-in GitHub user can access the installation returned by the setup flow. The OAuth user token is held in memory only for that check and is discarded; the database stores only the installation ID, account login, connecting SaaS user, and whether Workflows write was granted.

## Server environment

Set these values in the server runtime environment. Do not commit populated values or expose them to browser code:

| Variable | GitHub App value |
| --- | --- |
| GITHUB_APP_ID | App ID |
| GITHUB_APP_SLUG | App URL slug |
| GITHUB_APP_CLIENT_ID | Client ID |
| GITHUB_APP_CLIENT_SECRET | Client secret |
| GITHUB_APP_PRIVATE_KEY | Private key PEM; escaped newlines are accepted |
| GITHUB_APP_STATE_SECRET | Random secret with at least 32 characters, used to sign short-lived state |

Restart or redeploy the server after changing app configuration. Use the SaaS dashboard's Connect GitHub App link to install or update the app for an organization.

## Repository flow and boundaries

1. An organization owner or admin connects the GitHub App.
2. An owner or admin links a repository using its HTTPS GitHub URL.
3. An active organization member may run a read-only audit. It checks the selected repository's default branch, supported project manifests, and existing reusable workflows.
4. If a supported project is missing the pinned Devobs shared CI workflow and the installation includes Workflows write, an owner or admin can request a repair draft PR.
5. The repair creates a dated branch from the current default branch and adds only .github/workflows/devobs-shared-ci.yml. It opens a draft PR for human review. The app does not change the default branch, merge the PR, or deploy.

The repair only applies to repositories with a lockfile-backed Node project, a tested Python project, a PHP/Composer project with a test script, or shell scripts. Ambiguous, oversized, unsupported, or already-configured repositories require manual review.

Installation records are tenant-scoped with PostgreSQL row-level security. A GitHub installation can be linked to only one SaaS organization. The app creates short-lived installation tokens on demand and does not store user tokens or installation tokens.

## Source provenance

The catalog and reusable workflow reference are pinned to Devobs source commit e1b1f704cf963a4e1f4a39f7e1e8d719dbb88815. This proves what is present in that source snapshot; it does not prove the live Devobs site or any customer repository is healthy.

GitHub references:

- [Authorizing users during installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authorizing-users-during-installation)
- [List installations accessible to the authenticated user](https://docs.github.com/en/rest/apps/installations?apiVersion=2022-11-28#list-app-installations-accessible-to-the-authenticated-user)
- [Create or update repository file contents](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents)
