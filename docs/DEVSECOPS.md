# DevSecOps workflow integrations

## OpenSSF Scorecard

The repository exposes a manual-only OpenSSF Scorecard report through
`.github/workflows/openssf-scorecard.yml`. It calls the reusable workflow in
`hamedonassar95/Devobs`, pinned to the full merge commit SHA
`783a3d329d829e9c2f10cbd33fa6abe77abda846`.

The caller grants only read access to checks, contents, issues, and pull
requests. It does not run on pushes or pull requests, publish results to the
Scorecard API, upload the full JSON report, or block merges. Start it from the
Actions tab with **OpenSSF Scorecard report** and **Run workflow**.

This repository is public, so the report summary is visible in the workflow
run. The JSON artifact remains disabled. The Scorecard posture report evaluates
repository practices; it does not prove successful AI model calls or production
runtime behavior.

References:

- [GitHub: reusing workflow configurations](https://docs.github.com/en/actions/sharing-automations/reusing-workflows)
- [OpenSSF Scorecard](https://github.com/ossf/scorecard)
