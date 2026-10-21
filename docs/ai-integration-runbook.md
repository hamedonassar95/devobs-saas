# Cloudflare Workers AI integration runbook

This runbook configures the existing optional alert-triage integration for the Netlify deployment. It does not create a Cloudflare account, add credentials, change a billing plan, enable AI, or deploy the application. The provider stays off until the application operator completes the checks below.

## What is already implemented

- Alert analysis uses Cloudflare Workers AI with the pinned model `@cf/meta/llama-3.1-8b-instruct-fp8`.
- AI is off unless the provider switches, account ID, API token, and valid request caps are configured on the server. Each organization must also opt in, and the request must pass the Full-plan entitlement check.
- Alert text is redacted and length-limited before it is sent. The model is instructed to treat alert text as untrusted and return advisory JSON; it cannot run commands or change infrastructure. Redaction is pattern-based and is not a guarantee that every secret will be removed.
- Daily requests are capped at five per organization and ten for the whole app by default. Results are reused until the alert changes. Failed provider requests use deterministic local guidance; hitting a cap also returns local guidance.
- The code and API are present, but this repository does not currently include customer-facing AI settings or alert-analysis screens. An authenticated owner/admin can use the API routes below.

## 1. Prepare the Cloudflare account and token

1. In Cloudflare, confirm the account is on **Workers Free** and review its current Workers AI usage. The application cannot verify the account plan. The free allocation is shared with other workloads in the same account.
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

## 4. Enable analysis for one organization

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

## 5. Run one controlled analysis and review usage

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

Cloudflare's current published Workers Free allocation is **10,000 Neurons per account per day**. Requests above it fail on Workers Free; usage beyond the allowance requires Workers Paid. The selected model's published rate is currently **$0.152 per million input tokens** and **$0.287 per million output tokens** before any free allocation. Other Workers AI workloads in the same account use the same account allowance. App request caps reduce usage but cannot guarantee a zero bill or prevent another workload from using the shared allowance. Do not upgrade the account to make a failed free-plan request succeed without first reviewing and approving the cost implications.

Cloudflare's standard stateless inference documentation says prompts are not retained after processing and customer content is not used to train models, subject to the limited exceptions and operational metadata described in its data-use documentation. Review the current Cloudflare terms before sending customer alerts. The app sends redacted alert title and description, severity, status, and source type. Treat alerts as sensitive because automated redaction cannot identify every credential format.

## Troubleshooting

- **`providerAvailable: false`**: check the Netlify Production context for the account ID, token, both switches, and valid request caps; confirm a new deployment ran. Do not expose or paste the token while troubleshooting.
- **Enable returns HTTP 503**: the application-level Workers AI configuration is incomplete or the free-plan attestation/switch is off.
- **Enable returns HTTP 402**: the organization does not currently have the Full-plan entitlement required for analysis.
- **Analysis returns local guidance**: check app switches, organization opt-in, request limits, and Cloudflare usage/errors. Local guidance is expected fallback behavior.
- **401/403**: sign in as an organization member with the required read/write permission. Only an OWNER/ADMIN can change the organization opt-in.
- **No AI controls are visible in the site**: that is current product behavior; this repository has API routes but no customer-facing AI control or alert-analysis UI.

## Official documentation checked 2026-10-21

- [Workers AI pricing and free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/)
- [REST API and token permissions](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
- [Pinned Llama model and pricing](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/)
