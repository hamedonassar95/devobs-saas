# Local Graphify index — devobs-saas

**Status: VERIFIED local, opt-in, read-only.** The pinned CLI and central
orchestrator live in [Devobs](https://github.com/hamedonassar95/Devobs/blob/main/docs/architecture/graphify-integration.md).
No source is uploaded, no hosted service or paid inference is used, and no CI,
deployment or repository permission is changed by this integration.

## Privacy boundary

Extraction uses the pinned `graphifyy` 0.9.113 CLI with `GRAPHIFY_BACKEND=none`,
blank provider keys, `--code-only --no-cluster` and an external `--out` root
outside this source tree. Default exclusions cover `.env*`, secrets and
credentials, private keys/certificates, tfstate and build directories. This
repository additionally excludes `terraform.tfvars.example` and Firebase
configuration JSON.

## Reproduce locally

From a Devobs checkout:

```powershell
python scripts/graphify/multi_repo.py run `
  --manifest assets/graphify/multi_repo_manifest.json `
  --index-root <external-index-root> `
  --source-root portfolio=<local-portfolio-root> `
  --graphify-bin <pinned-graphify-exe> `
  --json-out <external-report.json>
```

`<local-portfolio-root>` is the directory that contains this repository. The
manifest entry for this repository is tagged `devobs-saas`.

## VERIFIED evidence (2026-11-20, local run)

| Metric | Value |
| --- | --- |
| Status | `success` |
| Nodes / edges | 758 / 1,840 |
| Graph size / extract time | 655,362 bytes / 9,982 ms |
| Graph SHA-256 (prefix) | `74669015a9f3052d` |
| Search / impact | `ambiguous`, `no_match` / `ok` |
| Source unchanged during extraction | yes |
| Sensitive indexed source files | 0 |

## Limits

This is local evidence only: no hosted CI run, push or pull request is claimed
by this document. Search fallback statuses `ambiguous` and `no_match` are
reported by the offline CLI and are not treated as failures.
