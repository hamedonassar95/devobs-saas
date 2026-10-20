# Provider costs and free-only integrations

Checked against vendor pricing and documentation on 2026-10-20. Prices and plan limits can change; this list is not a promise that running the entire SaaS costs zero.

## Included in this change

| Provider | Included capability | Cost boundary |
| --- | --- | --- |
| GitHub | Read the latest Actions workflow runs for a repository | The app only makes a read-only API request when a tenant asks for runs. It never dispatches, retries, or cancels workflows. GitHub Actions itself can be billable after a plan's included quota, so workflow execution remains the repository owner's choice. |
| GitLab.com | Read recent pipeline records | The app never starts a pipeline. GitLab documents 400 Free-tier compute minutes per month and allows additional minutes to be purchased; those limits apply to jobs run by GitLab, not this read-only query. |
| Bitbucket Cloud | Read recent pipeline records | The app never starts a pipeline. Bitbucket's Free plan includes 50 build minutes per month for up to five users, and its billing docs list paid overage. |
| Prometheus Alertmanager | Receive alert webhooks from a customer-operated Alertmanager | Prometheus and Alertmanager are open source. The customer still pays any compute, storage, networking, or operations costs for their own monitoring host. |
| Grafana Alerting | Receive alert webhooks from a customer-operated Grafana OSS instance | This integration is for self-hosted Grafana OSS only, not Grafana Cloud. Grafana OSS is AGPLv3; hosting and operations can still cost money. |
| Local rules | Create deterministic alert triage guidance inside the app | No model/API request is made. This is rules-based guidance, not generated AI. |

CI/CD access tokens are sent only in the `X-CICD-Provider-Token` header for a single read request and are not stored. Use the smallest read-only token scope supported by the provider: GitHub repository Actions read permission, GitLab `read_api`, or Bitbucket read access to repositories and pipelines. No pipeline or build action is exposed by these connectors.

Monitoring webhook secrets are generated when a monitoring source is created. The creation response returns the bearer token once; PostgreSQL stores only its SHA-256 hash. Keep the token in the monitoring provider's secret configuration and send it in the `Authorization: Bearer ...` header. The app caps payloads at 256 KiB and 100 alerts per request, checks tenant/source scope under PostgreSQL RLS, and upserts alerts by provider fingerprint so retries do not create duplicate rows.

## Excluded because use can be billed

- **Vertex AI / Gemini API:** model requests are metered by input/output tokens (and model/region). No generative model is called by this implementation.
- **Datadog:** hosted monitoring is priced by products and usage, including per-host charges. The API connector is not enabled.
- **Amazon CloudWatch:** metrics, logs, and alarms can incur usage charges beyond free allowances. The API connector is not enabled.
- **Grafana Cloud:** hosted plans include usage limits and paid tiers/usage-based plans. Only customer-operated OSS Grafana webhooks are accepted.

The local analysis route is available at `POST /api/organizations/{organizationId}/alerts/{alertId}/analysis`. It requires the same Full-plan entitlement as existing analysis results, but uses only fixed local rules and records `local-rules-v1` as its engine.

## API setup

1. Create a CI/CD integration with `POST /api/organizations/{organizationId}/integrations`, using `GITHUB`, `GITLAB`, or `BITBUCKET` and the repository HTTPS URL.
2. Fetch the integration's recent runs with `GET /api/organizations/{organizationId}/integrations/{integrationId}/runs`, an authenticated app session, and `X-CICD-Provider-Token: <read-only-token>`.
3. Create a monitoring source with `POST /api/organizations/{organizationId}/monitoring-sources`, using `PROMETHEUS` or `GRAFANA`. Save the returned `webhookPath` and `webhookToken`; the token cannot be retrieved later.
4. Configure the Alertmanager/Grafana webhook to POST JSON to the returned path with `Authorization: Bearer <webhookToken>`. Configure the token as a secret in the monitoring system, not in a public URL or repository. An admin or owner can rotate it with `POST /api/organizations/{organizationId}/monitoring-sources/{sourceId}/webhook-token`; the new token is returned once and invalidates the previous token immediately.

All routes still require the applicable subscription and active organization membership. CI/CD calls are read-only. Webhook delivery requires an active Monitoring entitlement.

## Costs this code cannot eliminate

The application's Cloud Run service, PostgreSQL database, Secret Manager, internet egress, domain, Stripe, email delivery, and customer-operated monitoring or CI runners can all have charges. This change does not create cloud resources, invoke a metered provider, start CI jobs, or deploy the app. Review the account-specific pricing and budget settings before operating the SaaS.

## Official references

- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitLab compute minutes](https://docs.gitlab.com/ci/pipelines/compute_minutes/)
- [Bitbucket Pipelines limits](https://support.atlassian.com/bitbucket-cloud/docs/limitations-of-bitbucket-pipelines/)
- [Bitbucket plan billing and overages](https://support.atlassian.com/bitbucket-cloud/docs/manage-your-plan-and-billing/)
- [Prometheus project](https://prometheus.io/) and [Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/)
- [Grafana licensing](https://grafana.com/licensing/) and [Grafana Cloud pricing](https://grafana.com/pricing/)
- [Datadog pricing](https://www.datadoghq.com/pricing/)
- [Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)
- [Google Cloud generative AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)
