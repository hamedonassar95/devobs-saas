# Offline AI alert-analysis evaluation

The SaaS analysis path uses Cloudflare Workers AI when an organization has
opted in and the provider is configured; otherwise it returns deterministic
local guidance. The repository includes an offline smoke corpus for this exact
alert contract. It makes no provider calls and does not use real customer data.

## Dataset and output format

The 36-case synthetic corpus is in
[`tests/fixtures/ai-evals/alert-analysis.jsonl`](../tests/fixtures/ai-evals/alert-analysis.jsonl).
Eight SaaS-specific cases cover database, CPU, memory, disk, resolved alerts,
prompt injection, redaction, and low evidence. The other 28 alert descriptions
are adapted from the synthetic, unreviewed incident scenarios in
[`Devobs` at commit `cc32442`](https://github.com/hamedonassar95/Devobs/blob/cc324425f7432314bee74befc96c73b2c405c4f3/tests/fixtures/ai-evals/decisions-triage.jsonl).
Their original category, security-impact, and severity labels are retained as
provenance only. They are not treated as ground truth for the SaaS analysis
output. Source severity levels are mapped to the SaaS alert enum (`0–1` to
`INFO`, `2–3` to `WARNING`, and `4` to `CRITICAL`) solely to construct input
alerts. All 36 examples remain `synthetic_unreviewed`. The evidence checks are
lexical smoke checks, not semantic truth labels.

Save candidate results privately as JSONL with one record per case. `analysis`
must match the stored result shape returned by the SaaS analysis service:

```json
{"case_id":"database-pool-critical","analysis":{"summary":"...","details":{"engine":"cloudflare-workers-ai","model":"cloudflare-workers-ai/@cf/meta/llama-3.1-8b-instruct-fp8","severity":"CRITICAL","status":"OPEN","sourceProvider":"PROMETHEUS","likelyCause":"...","confidence":"medium","nextSteps":["..."],"note":"AI-generated advisory only. Verify evidence and have a human review before any production change."},"model":"cloudflare-workers-ai/@cf/meta/llama-3.1-8b-instruct-fp8","providerCall":{"attempted":true,"outcome":"succeeded","durationMs":12,"tokenUsage":{"promptTokens":240,"completionTokens":42}}}}
```

Run the offline evaluator:

```bash
node scripts/evaluate-alert-analysis.mjs \
  --dataset tests/fixtures/ai-evals/alert-analysis.jsonl \
  --outputs /path/to/private-alert-analysis-outputs.jsonl
```

The unit suite also passes the full corpus through the actual deterministic SaaS
analysis service with the provider disabled and confirms no fetch call occurs.
Use `--require-provider` when evaluating saved Cloudflare model outputs rather
than local fallbacks. The default minimum pass rate is 100%;
`--minimum-pass-rate 0` allows inspection of failing cases. The report emits
case IDs and check results only; it never echoes alert or model text. Keep
candidate outputs out of Git because they can contain customer incident data.

## Scope and limitations

The checks cover output shape, severity/status/source preservation, required
evidence terms, canary non-disclosure, a small set of destructive-action
patterns, advisory notes, and optional provider-only runs. These checks are
intentionally deterministic, but lexical evidence and danger-pattern checks
can miss semantic errors and may need expert tuning.

At runtime, the Cloudflare adapter applies the same bounded high-risk pattern
checks to `summary`, `likelyCause`, and `nextSteps` before saving a model result.
If a match is not explicitly negated in the same sentence, the model result is
discarded and deterministic local guidance is returned without a retry. Known
credential and email patterns are also redacted from those output fields before
they are saved. This is a narrow defense-in-depth filter; it cannot establish
that all remaining model text is safe or correct.

Cloudflare's JSON Mode is not enabled for the pinned model. The current JSON
Mode support list does not name `@cf/meta/llama-3.1-8b-instruct-fp8`, so the
adapter continues to parse the model's string response and validate it with
the local schema. Revisit this only after Cloudflare documents support for the
exact model ID.

All checked-in examples are synthetic and unreviewed. Passing this smoke suite
does **not** establish accuracy, confidence calibration, safety, ROI, or
production readiness. To measure quality, add representative redacted alerts
with independently expert-reviewed labels, adjudicate disagreements, hold out
cases from tuning, and set thresholds based on the cost of false positives and
false negatives. Then generate model outputs only after confirming the
Cloudflare account's plan, limits, privacy terms, and operator approval gate.

The provider path remains opt-in and requires the runtime configuration and
daily usage limits described in
[`provider-costs.md`](provider-costs.md). This evaluator never reads provider
credentials or changes environment settings.
