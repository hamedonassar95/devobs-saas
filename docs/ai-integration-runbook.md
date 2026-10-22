# Cloudflare Workers AI integration runbook

This runbook configures the existing optional alert-triage integration for the Netlify deployment. It does not create a Cloudflare account, add credentials, change a billing plan, enable AI, or deploy the application. The provider stays off until the application operator completes the checks below.

## What is already implemented

- Alert analysis uses Cloudflare Workers AI with the pinned model `@cf/meta/llama-3.1-8b-instruct-fp8`.
- AI is off unless the provider switches, account ID, API token, and valid request caps are configured on the server. Each organization must also opt in, and the request must pass the Full-plan entitlement check.
- Alert text is redacted and length-limited before it is sent. Model output is schema-validated, checked against a small set of high-risk mutation patterns, and redacted for known credential and email patterns before it is saved. A match causes the model result to be discarded in favor of deterministic local guidance without a retry. These pattern checks cannot guarantee all advice is safe or accurate; the model has no tools and cannot change infrastructure.
- Daily requests are capped at five per organization and ten for the whole app by default. Results are reused until the alert changes. Failed provider requests use deterministic local guidance; hitting a cap also returns local guidance.
- A signed-in member can open `/dashboard/ai` to review provider readiness and usage, inspect recent alerts, request advisory analysis, and view saved results. Owners/admins can change the organization opt-in; owners, admins, and members can request analysis. The API remains the authorization boundary.
- Monitoring-source creation is still API-managed. The webhook credential is returned once and is not shown again, so store it in the monitoring provider when creating the source.

## 1. Prepare the Cloudflare account and token

1. In Cloudflare, confirm the account is on **Workers Free** and review its current Workers AI usage. The application cannot verify the account plan. Cloudflare currently publishes a free allocation of 10,000 Neurons per account per day; it is shared with other workloads in that account.
2. Create a Cloudflare API token using the Workers AI token template, or a custom token with the minimum **Workers AI Read** and **Workers AI Edit** permissions required by Cloudflare's REST API.
3. Copy the account ID and token into your password manager temporarily. Do not put them in chat, a source file, a GitHub issue, a browser-side variable, or a `NEXT_PUBLIC_*` variable.
4. Keep the account on Workers Free while relying on the application's free-plan guard. Do not enable a paid upgrade or credit auto-recharge for this setup.

## 2. Add production-only variables in Netlify

In the Netlify project for `devobs-saas`, open **Project configuration → Environment variables**. Add the following for the **Production** context only. Do not share the production token with Deploy Previews or local development.

| Variable | Value | Secret? |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The 32-character Cloudflare account ID | No, but keep it in server-side configuration |
| `CLOUDFLARE_API_TOKEN` | The token created above | Yes; select **Contains secret values** |
| `CLOUDFLARE_WORKERS_AI_FREE_PLAN_CONFIRMED` | `false` until the owner has verified Workers Free; then `true` | No; this is an operator attestation |
| `CLOUDFLARE_WORKERS_AI_ENABLED` | `false` until the account, token, and spend guard are reviewed; then `true` | No |
| `CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_PER_ORG` | `5` | No |
| `CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_TOTAL` | `10` | No |

The request caps may be lowered. If changed, each must be an integer from 1 through 100. A malformed cap disables provider configuration. The shared cap applies to all organizations and resets at UTC midnight. A request reservation is consumed even if the provider call fails.

Initially leave **both** switches set to `false`. Save the token as a Netlify secret. Never set these values in `netlify.toml`, the GitHub repository, or client-side configuration.

## 3. Deploy the server configuration safely

1. Confirm the Netlify production `DATABASE_URL` and `APP_URL` and the protected GitHub `production` environment are configured. The current workflow also needs the approved Neon and Netlify deployment settings described in [deploy-netlify.md](./deploy-netlify.md).
2. Confirm the app's login works and that the intended operator belongs to the organization. If account creation or sign-in is still failing, resolve that first; the AI routes require an authenticated organization member.
3. Keep Netlify automatic Git builds paused so deployments continue through the protected GitHub Actions approval flow.
4. Save the variables with both switches `false`, then deploy the reviewed `main` revision through the existing protected workflow. A Netlify variable change is available to server functions on a new deploy.
5. Check `/api/health` and confirm the app is usable. The `providerAvailable` field will be `false` while the global AI switch is off; the app does not validate Cloudflare connectivity just by reading the configuration.
6. Only after confirming the Cloudflare account is still Workers Free and the request caps are acceptable, set `CLOUDFLARE_WORKERS_AI_FREE_PLAN_CONFIRMED=true` and `CLOUDFLARE_WORKERS_AI_ENABLED=true` in Netlify Production and redeploy through the protected workflow. Do not enable any organization's opt-in until this deployment is live and the configuration has been reviewed.

If enabling the integration is not desired, leave both switches `false` or leave the token unset. In that state the app uses local rules and does not call Cloudflare.

## 4. Use the customer-facing AI console

1. Sign in to the SaaS at `/login`. A new customer must first use `/register`; Netlify and GitHub accounts do not create a SaaS customer account.
2. Open `/dashboard/ai` and select an organization. The page uses the existing authenticated organization and AI-settings, alerts, and analysis-results APIs.
3. Review the provider state and usage before enabling anything. If the provider is unavailable, requests use deterministic local rules. The page shows app request caps, reported token usage, and a cost estimate when provider usage is complete. It does not meter Neurons or include other Cloudflare workloads.
4. Only an OWNER or ADMIN can enable the organization's provider opt-in. An active or trialing Full subscription is required. An OWNER, ADMIN, or MEMBER can request analysis for an alert; VIEWER is read-only. The API enforces these permissions and the subscription entitlement.
5. Read the data-handling note, then request analysis for one alert. When the organization and global provider switches are both enabled and the request is within the limits, redacted alert text is sent in a single Cloudflare request. Otherwise, the app returns local guidance. Review either result as advisory; no remediation is executed.
6. To receive real alerts, create an Alertmanager or Grafana monitoring source through the authenticated API and configure its one-time bearer credential at the provider. The AI page does not yet create monitoring sources.

## 5. Enable analysis for one organization

An organization must have an active or trialing **Full** plan. A signed-in organization OWNER or ADMIN can check provider readiness and enable its own organization's opt-in. Replace the IDs with the real IDs; keep the signed-in session in the same browser. These routes require the app's authenticated session and are not public endpoints.

```js
const organizationId = "YOUR_ORGANIZATION_ID";

const status = await fetch(`/api/organizations/${organizationId}/ai-settings`, {
  credentials: "same-origin",
}).then((response) => response.json());
console.log(status);
```

Proceed only when `providerAvailable` is `true`, `freePlanConfirmed` is `true`, and the displayed daily limits are as expected. `providerAvailable` confirms required settings are present, but does not prove the token is valid or that Cloudflare will accept a request. Enabling the organization opt-in:

```js
const result = await fetch(`/api/organizations/${organizationId}/ai-settings`, {
  method: "PATCH",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ enabled: true }),
}).then(async (response) => ({ status: response.status, body: await response.json() }));
console.log(result);
```

To turn off future provider requests, send `{"enabled":false}` to the same `PATCH` route. The organization's owner/admin opt-in is stored in the database. App-level switches remain operator-controlled in Netlify.

## 6. Run one controlled analysis and review usage

Use a synthetic or already-redacted alert first. A signed-in user with write access can request analysis for an alert in that organization:

```js
const alertId = "YOUR_ALERT_ID";

const result = await fetch(
  `/api/organizations/${organizationId}/alerts/${alertId}/analysis`,
  { method: "POST", credentials: "same-origin" },
).then(async (response) => ({ status: response.status, body: await response.json() }));
console.log(result);
```

Review the saved `item` as advisory triage only. A `model` value identifying Cloudflare indicates model analysis; a local-rules model or note means the provider was disabled, unavailable, or capped. The API does not execute suggested next steps.

Use `GET /api/organizations/{organizationId}/ai-settings` to review today's and this month's reserved, successful, failed, pending, and usage-reported requests, average latency, token totals, and estimated cost. Cost is shown as unknown when token usage is incomplete. Compare it with Cloudflare's account billing and usage dashboards; the app estimate covers only this app and excludes the free allocation.

## Cost, privacy, and operating limits

Cloudflare currently publishes a Workers AI free allocation of **10,000 Neurons per account per day**. The Workers AI pricing page lists a rate of **$0.011 per 1,000 Neurons** above the daily free allocation on Workers Paid. The pinned model page also publishes **$0.152 per million input tokens** and **$0.287 per million output tokens**; the application uses those model token rates for its estimate when usage is reported. Neurons are the provider billing unit; the app does not calculate them. Other Workers AI workloads in the same account share the free allocation. App request caps reduce this app's usage but cannot guarantee a zero bill or limit other workloads.

Cloudflare's current data-use documentation says standard stateless inference inputs and outputs are not retained after processing and customer content is not used to train models, subject to the documented exceptions. Review the current Cloudflare terms before sending customer alerts. The app sends redacted alert title and description, severity, status, and source type. Treat alerts as sensitive because automated redaction cannot identify every credential format.

## Troubleshooting

- **`providerAvailable: false`**: check the Netlify Production context for the account ID, token, both switches, and valid request caps; confirm a new deployment ran. Do not expose or paste the token while troubleshooting.
- **Enable returns HTTP 503**: the application-level Workers AI configuration is incomplete or the free-plan attestation/switch is off.
- **Enable returns HTTP 402**: the organization does not currently have the Full-plan entitlement required for analysis.
- **Analysis returns local guidance**: check app switches, organization opt-in, request limits, and Cloudflare usage/errors. Local guidance is expected fallback behavior.
- **Analysis falls back after a model response**: a malformed response or output matching a configured high-risk mutation pattern is discarded. The app records a failed provider outcome and returns local guidance without retrying.
- **401/403**: sign in as an organization member with the required read/write permission. Only an OWNER/ADMIN can change the organization opt-in.
- **AI controls are missing**: sign in to a registered SaaS account and open `/dashboard/ai`. The page is included in this source revision; check the deployed revision if the route is missing. Monitoring-source creation remains API-managed.

## Official documentation checked 2026-10-22

- [Workers AI pricing and free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Workers AI model card and token rates](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/)
- [Workers AI request limits](https://developers.cloudflare.com/workers-ai/platform/limits/)
- [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/)
- [REST API and token permissions](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
- [Pinned Llama model and pricing](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/)
