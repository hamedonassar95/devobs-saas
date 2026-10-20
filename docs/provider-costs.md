# Provider costs and free-only integrations

Checked against vendor pricing and documentation on 2026-10-20. Prices, free allowances, terms, and model availability can change. This list does not promise that operating the entire SaaS costs zero.

## Included integrations

| Provider | Capability | Cost boundary |
| --- | --- | --- |
| GitHub | Read recent Actions workflow runs | The app never dispatches, retries, or cancels workflows. GitHub Actions execution can be billable after the repository's included quota. |
| GitLab.com | Read recent pipeline records | The app never starts a pipeline. GitLab documents 400 Free-tier compute minutes per month and permits paid additional minutes; those costs are for GitLab jobs, not this read-only query. |
| Bitbucket Cloud | Read recent pipeline records | The app never starts a pipeline. The Free plan includes 50 build minutes per month for up to five users; Atlassian documents paid overage. |
| Prometheus Alertmanager | Receive alerts from a customer-operated Alertmanager | The software is open source. Hosting, storage, networking, and operations still have customer infrastructure costs. |
| Grafana Alerting | Receive alerts from self-hosted Grafana OSS | This is Grafana OSS, not Grafana Cloud. The software is AGPLv3; hosting and operations may cost money. |
| Local rules | Deterministic alert triage guidance | No model/API request is made; this is rules-based guidance, not generated AI. |
| Cloudflare Workers AI | Optional alert analysis using `@cf/meta/llama-3.1-8b-instruct-fp8` | Workers Free documents a 10,000 Neurons/day allowance at no charge. Above that allowance, Workers Free requests fail; usage above the allowance on Workers Paid is billed at the published rate. The operator must verify that the account remains on Workers Free and must not upgrade it. |

CI/CD access tokens are sent only in the `X-CICD-Provider-Token` header for a single read request and are not stored. Use the smallest read-only token scope supported by the provider: GitHub repository Actions read permission, GitLab `read_api`, or Bitbucket read access to repositories and pipelines. No pipeline or build action is exposed by these connectors.

Monitoring webhook secrets are generated when a source is created. The bearer token is returned once; PostgreSQL stores only its SHA-256 hash. The app caps payloads at 256 KiB and 100 alerts per request, checks tenant/source scope under PostgreSQL RLS, and upserts by provider fingerprint.

## AI analysis configuration and privacy

The analysis route is `POST /api/organizations/{organizationId}/alerts/{alertId}/analysis`; it requires an active/trialing Full plan. Local fixed rules remain the default. The optional AI provider is off unless all of these are true:

1. The application operator verifies that the Cloudflare account is on Workers Free, sets `CLOUDFLARE_WORKERS_AI_FREE_PLAN_CONFIRMED=true`, and configures the account/token on the server. This flag is an operator attestation; the app cannot inspect the account's billing plan.
2. The operator sets `CLOUDFLARE_WORKERS_AI_ENABLED=true` only after that review and will not upgrade the account to Workers Paid while relying on the free-only guard.
3. An OWNER or ADMIN enables AI for the organization through `PATCH /api/organizations/{organizationId}/ai-settings` with `{"enabled":true}`. The organization must have an active/trialing Full plan. `GET` on this route returns the opt-in and provider availability without exposing the API token.

When enabled, the app sends only a redacted and length-limited alert title/description plus normalized severity, status, and monitoring source type. It does not send tenant IDs, alert IDs, source tokens, or CI/CD credentials. The model response must match a small validated schema. The output is advisory only: it cannot call tools, change production, or approve a recovery. One fixed model request is made without automatic retries, repeated results are reused until the alert changes, and a deterministic local result is returned if inference fails. Disabling the organization's opt-in stops future provider requests.

The server reserves no more than five provider requests per organization per UTC day by default. The operator can set `CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_PER_ORG` to an integer from 1 to 100. Requests are reserved before inference, so concurrent requests cannot pass the same organization's cap; a provider failure still consumes the reservation. When the cap is reached, the app returns local rules guidance without calling the model. `GET /api/organizations/{organizationId}/ai-settings` reports today's reserved, succeeded, failed, and pending requests plus average latency. The ledger stores counts and latency only, not prompts, model responses, tokens, or credentials. These are per-organization guardrails and telemetry, not a provider-account-wide budget or a dollar-cost estimate. Cloudflare's account-level free allocation remains the outer quota, and any paid account can still incur charges if the operator changes the account plan or uses other paid resources.

Cloudflare documents zero retention for standard stateless inference after processing and says Customer Content is not used to train models. Its data-use page describes limited legal/safety exceptions and retained operational metadata. Review Cloudflare's current agreements and privacy terms before sending customer content. The code cannot verify the Cloudflare account plan or other workloads using that account, so it does not guarantee a zero bill if the owner uses Workers Paid or upgrades the account. Do not enable the provider unless the Workers Free plan is confirmed.

At the 2026-10-20 review, Cloudflare's paid-billing-only model list did not include the selected Llama 3.1 8B FP8 model. Recheck that list before launch; model availability and free-plan eligibility can change.

The selected model is Meta Llama 3.1. Meta's community license requires prominent “Built with Meta Llama 3” attribution when a product or service uses Llama materials and includes additional commercial terms above 700 million monthly active users. The landing page includes the attribution; review the license and acceptable-use policy before production launch.

## Excluded from runtime

- **Vertex AI / Gemini API:** usage is metered by tokens and model/region. Gemini's unpaid API tier also marks submitted content as used to improve Google products. It is not enabled for customer alerts.
- **OpenAI / GitHub Copilot:** these are used for Devobs repository automation under separate credentials and potentially paid quotas; they are not SaaS runtime providers.
- **GitHub Models:** GitHub documents that its Models service was retired on July 30, 2026.
- **Datadog, Amazon CloudWatch, and Grafana Cloud:** these hosted services have usage-based or paid tiers. Only free/read-only capabilities described above are included.

## API setup

1. Create a CI/CD integration using `POST /api/organizations/{organizationId}/integrations` with `GITHUB`, `GITLAB`, or `BITBUCKET` and a repository HTTPS URL.
2. Read recent runs with `GET /api/organizations/{organizationId}/integrations/{integrationId}/runs`, an authenticated session, and `X-CICD-Provider-Token: <read-only-token>`.
3. Create a monitoring source using `POST /api/organizations/{organizationId}/monitoring-sources` with `PROMETHEUS` or `GRAFANA`. Save the returned webhook path/token; the token cannot be retrieved later.
4. Configure Alertmanager/Grafana to POST to that path with `Authorization: Bearer <webhookToken>`. Store the token in the monitoring system's secret configuration.
5. If the provider account is confirmed to remain on Workers Free, configure the optional Cloudflare token in server-side Secret Manager. Do not send it in a browser request or store it in the repository. Then an organization OWNER/ADMIN can check and enable its opt-in through the AI settings API.

All customer resource routes require active organization membership and the applicable subscription. CI/CD calls are read-only. Monitoring webhooks require a Monitoring entitlement.

## Costs outside these integrations

Cloud Run, PostgreSQL, Secret Manager versions/access, internet egress, domain registration, Stripe processing, email delivery, and customer-operated monitoring or CI runners may incur charges. This code change does not create cloud resources, populate secrets, call an AI provider, start CI jobs, or deploy the app. Google Cloud infrastructure remains owner-operated and must be reviewed separately.

## Official references

- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitLab compute minutes](https://docs.gitlab.com/ci/pipelines/compute_minutes/)
- [Bitbucket Pipelines limitations](https://support.atlassian.com/bitbucket-cloud/docs/limitations-of-bitbucket-pipelines/)
- [Bitbucket plan billing and overages](https://support.atlassian.com/bitbucket-cloud/docs/manage-your-plan-and-billing/)
- [Prometheus and Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/)
- [Grafana licensing](https://grafana.com/licensing/) and [Grafana Cloud pricing](https://grafana.com/pricing/)
- [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Cloudflare Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/)
- [Cloudflare Workers AI REST API](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
- [Cloudflare Llama 3.1 8B FP8 model API and parameters](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/)
- [Meta Llama 3 community license](https://www.llama.com/llama3/license/)
- [Meta Llama 3 acceptable use policy](https://www.llama.com/llama3/use-policy/)
- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)
- [GitHub Models service status](https://docs.github.com/en/github-models)
- [Vertex AI generative AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)
