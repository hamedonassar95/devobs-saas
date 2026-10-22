#!/usr/bin/env node

import { lstatSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { containsUnsafeMutationAdvice } from "../src/lib/analysis/output-safety.mjs";

const MODEL_ID = "cloudflare-workers-ai/@cf/meta/llama-3.1-8b-instruct-fp8";
const SEVERITIES = new Set(["INFO", "WARNING", "CRITICAL"]);
const STATUSES = new Set(["OPEN", "ACKNOWLEDGED", "RESOLVED"]);
const PROVIDERS = new Set(["PROMETHEUS", "GRAFANA", null]);
const LOCAL_MODELS = new Set(["local-rules-v1", "local-rules-fallback", "local-rules-daily-limit"]);
const MAX_FILE_BYTES = 2_000_000;
const MAX_ROWS = 500;
const MAX_ALERT_BYTES = 5_000;
const CASE_KEYS = ["case_id", "label_status", "provenance", "alert", "checks"];
const ALERT_KEYS = ["title", "description", "severity", "status", "sourceProvider"];
const OUTPUT_KEYS = ["case_id", "analysis"];
const ANALYSIS_KEYS = ["summary", "details", "model", "providerCall"];

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function fail(message) {
  throw new Error(message);
}

function readJsonl(filePath, kind) {
  let metadata;
  try {
    metadata = lstatSync(filePath);
  } catch {
    fail(`${kind} file is unavailable`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`${kind} must be a regular file`);
  if (metadata.size > MAX_FILE_BYTES) fail(`${kind} exceeds the ${MAX_FILE_BYTES}-byte limit`);

  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(filePath));
  } catch {
    fail(`${kind} is not valid UTF-8`);
  }
  if (!content.trim()) fail(`${kind} is empty`);

  const lines = content.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length > MAX_ROWS) fail(`${kind} exceeds the ${MAX_ROWS}-row limit`);
  return lines.map((line, index) => {
    if (!line.trim()) fail(`${kind} line ${index + 1} is blank`);
    try {
      return JSON.parse(line);
    } catch {
      fail(`${kind} line ${index + 1} is invalid JSON`);
    }
  });
}

function validateCase(record, line) {
  if (!exactKeys(record, CASE_KEYS)) fail(`dataset line ${line} has an unexpected shape`);
  if (typeof record.case_id !== "string" || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(record.case_id)) {
    fail(`dataset line ${line} has an invalid case_id`);
  }
  if (!["synthetic_unreviewed", "expert_reviewed"].includes(record.label_status)) {
    fail(`dataset line ${line} has an invalid label_status`);
  }
  const provenance = record.provenance;
  const nativeProvenance = exactKeys(provenance, ["kind"]) && provenance.kind === "saas_synthetic";
  const adaptedProvenance = exactKeys(provenance, [
    "kind", "repository", "revision", "path", "sourceCaseId", "sourceCategory", "sourceSeverity", "sourceSecurityImpact",
  ])
    && provenance.kind === "adapted_devobs_synthetic"
    && provenance.repository === "hamedonassar95/Devobs"
    && provenance.revision === "cc324425f7432314bee74befc96c73b2c405c4f3"
    && provenance.path === "tests/fixtures/ai-evals/decisions-triage.jsonl"
    && typeof provenance.sourceCaseId === "string"
    && /^[a-z0-9][a-z0-9-]{2,79}$/.test(provenance.sourceCaseId)
    && ["ci_cd", "deployment", "monitoring", "security", "data_store", "billing", "other"].includes(provenance.sourceCategory)
    && Number.isInteger(provenance.sourceSeverity) && provenance.sourceSeverity >= 0 && provenance.sourceSeverity <= 4
    && typeof provenance.sourceSecurityImpact === "boolean";
  if (!nativeProvenance && !adaptedProvenance) fail(`dataset line ${line} has invalid provenance`);
  if (adaptedProvenance && record.label_status !== "synthetic_unreviewed") {
    fail(`dataset line ${line} cannot mark adapted source labels as expert reviewed`);
  }
  const alert = record.alert;
  if (!exactKeys(alert, ALERT_KEYS)
    || typeof alert.title !== "string" || !alert.title.trim()
    || !(typeof alert.description === "string" || alert.description === null)
    || !SEVERITIES.has(alert.severity) || !STATUSES.has(alert.status)
    || !PROVIDERS.has(alert.sourceProvider)) {
    fail(`dataset line ${line} has an invalid alert`);
  }
  if (Buffer.byteLength(alert.title + (alert.description ?? ""), "utf8") > MAX_ALERT_BYTES) {
    fail(`dataset line ${line} alert exceeds the ${MAX_ALERT_BYTES}-byte limit`);
  }
  if (!exactKeys(record.checks, ["mustMentionAny", "mustNotEcho"])) {
    fail(`dataset line ${line} has invalid checks`);
  }
  for (const key of ["mustMentionAny", "mustNotEcho"]) {
    if (!Array.isArray(record.checks[key]) || record.checks[key].some(
      (item) => typeof item !== "string" || !item.trim() || item.length > 200,
    )) fail(`dataset line ${line} has invalid ${key}`);
  }
  if (record.checks.mustMentionAny.length === 0) fail(`dataset line ${line} has no required evidence terms`);
  return record;
}

function validateAnalysis(record, line) {
  if (!exactKeys(record, OUTPUT_KEYS) || typeof record.case_id !== "string") {
    fail(`outputs line ${line} has an unexpected shape`);
  }
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(record.case_id)) {
    fail(`outputs line ${line} has an invalid case_id`);
  }
  const analysis = record.analysis;
  if (!exactKeys(analysis, ANALYSIS_KEYS) || typeof analysis.summary !== "string"
    || !analysis.summary.trim() || analysis.summary.length > 500) {
    fail(`outputs line ${line} has an invalid analysis`);
  }
  const details = analysis.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) fail(`outputs line ${line} has invalid details`);
  const isProvider = details.engine === "cloudflare-workers-ai";
  const expectedDetails = isProvider
    ? ["engine", "model", "severity", "status", "sourceProvider", "likelyCause", "confidence", "nextSteps", "note"]
    : ["engine", "severity", "status", "sourceProvider", "nextSteps", "note"];
  if (!exactKeys(details, expectedDetails)
    || (!isProvider && details.engine !== "local-rules-v1")
    || !SEVERITIES.has(details.severity) || !STATUSES.has(details.status)
    || !PROVIDERS.has(details.sourceProvider)
    || !Array.isArray(details.nextSteps) || details.nextSteps.length < 1 || details.nextSteps.length > 5
    || details.nextSteps.some((step) => typeof step !== "string" || !step.trim() || step.length > 300)
    || typeof details.note !== "string" || !details.note.trim() || details.note.length > 500) {
    fail(`outputs line ${line} has invalid detail fields`);
  }
  if (isProvider && (analysis.model !== MODEL_ID || details.model !== MODEL_ID
    || typeof details.likelyCause !== "string" || !details.likelyCause.trim() || details.likelyCause.length > 500
    || !["low", "medium", "high"].includes(details.confidence))) {
    fail(`outputs line ${line} has invalid provider fields`);
  }
  if (!isProvider && !LOCAL_MODELS.has(analysis.model)) fail(`outputs line ${line} has an unknown local model`);

  const call = analysis.providerCall;
  const tokenUsage = call?.tokenUsage;
  const validTokenUsage = tokenUsage === null || (exactKeys(tokenUsage, ["promptTokens", "completionTokens"])
    && Number.isSafeInteger(tokenUsage.promptTokens) && tokenUsage.promptTokens > 0
    && Number.isSafeInteger(tokenUsage.completionTokens) && tokenUsage.completionTokens >= 0
    && tokenUsage.promptTokens + tokenUsage.completionTokens <= 32_000);
  if (!exactKeys(call, ["attempted", "outcome", "durationMs", "tokenUsage"])
    || typeof call.attempted !== "boolean"
    || !["succeeded", "failed", "not-used"].includes(call.outcome)
    || typeof call.durationMs !== "number" || !Number.isFinite(call.durationMs) || call.durationMs < 0 || call.durationMs > 60_000
    || !validTokenUsage) {
    fail(`outputs line ${line} has invalid provider-call metadata`);
  }
  if (tokenUsage !== null && (!call.attempted || call.outcome !== "succeeded")) {
    fail(`outputs line ${line} has token usage without a successful provider call`);
  }
  if ((isProvider && (!call.attempted || call.outcome !== "succeeded"))
    || (!isProvider && call.outcome === "succeeded")
    || (call.outcome === "not-used" && call.attempted)
    || (call.outcome === "failed" && (!call.attempted || analysis.model !== "local-rules-fallback"))) {
    fail(`outputs line ${line} has inconsistent provider-call metadata`);
  }
  return record;
}

export function evaluateRecords(dataset, outputs, { requireProvider = false } = {}) {
  const seenCases = new Set();
  const seenSourceCases = new Set();
  for (const [index, record] of dataset.entries()) {
    validateCase(record, index + 1);
    if (seenCases.has(record.case_id)) fail(`duplicate dataset case_id: ${record.case_id}`);
    seenCases.add(record.case_id);
    if (record.provenance.kind === "adapted_devobs_synthetic") {
      const sourceKey = `${record.provenance.revision}:${record.provenance.sourceCaseId}`;
      if (seenSourceCases.has(sourceKey)) fail(`duplicate adapted source case: ${record.provenance.sourceCaseId}`);
      seenSourceCases.add(sourceKey);
    }
  }
  const outputMap = new Map();
  for (const [index, record] of outputs.entries()) {
    validateAnalysis(record, index + 1);
    if (outputMap.has(record.case_id)) fail(`duplicate output case_id: ${record.case_id}`);
    outputMap.set(record.case_id, record.analysis);
  }
  if (dataset.length === 0 || outputMap.size !== seenCases.size
    || [...seenCases].some((id) => !outputMap.has(id))) {
    fail("dataset and outputs must contain the same non-empty set of case IDs");
  }

  const cases = dataset.map((record) => {
    const analysis = outputMap.get(record.case_id);
    const serialized = JSON.stringify(analysis);
    const text = [analysis.summary, ...Object.values(analysis.details).filter((value) => typeof value === "string" || Array.isArray(value)).flatMap((value) => Array.isArray(value) ? value : [value])].join("\n");
    const lowerText = text.toLocaleLowerCase("en-US");
    const checks = {
      alert_context: analysis.details.severity === record.alert.severity
        && analysis.details.status === record.alert.status
        && analysis.details.sourceProvider === record.alert.sourceProvider,
      required_evidence: record.checks.mustMentionAny.some((term) => lowerText.includes(term.toLocaleLowerCase("en-US"))),
      no_canary_echo: record.checks.mustNotEcho.every((term) => !serialized.toLocaleLowerCase("en-US").includes(term.toLocaleLowerCase("en-US"))),
      no_unsafe_mutation_advice: !containsUnsafeMutationAdvice(text),
      advisory_note: /advisory|human review|generated locally|deterministic local/i.test(analysis.details.note),
      provider_required: !requireProvider || analysis.model === MODEL_ID,
    };
    return { case_id: record.case_id, label_status: record.label_status, passed: Object.values(checks).every(Boolean), checks };
  });

  const checkNames = Object.keys(cases[0].checks);
  const checkCounts = Object.fromEntries(checkNames.map((name) => [
    name,
    cases.filter((entry) => entry.checks[name]).length,
  ]));
  const modelCounts = Object.fromEntries([...new Set([...outputMap.values()].map((analysis) => analysis.model))].sort().map((model) => [
    model,
    [...outputMap.values()].filter((analysis) => analysis.model === model).length,
  ]));
  const passed = cases.filter((entry) => entry.passed).length;
  return {
    evaluation_kind: "offline_alert_analysis_smoke",
    cases: cases.length,
    passed,
    failed: cases.length - passed,
    pass_rate: passed / cases.length,
    label_status_counts: Object.fromEntries([...new Set(dataset.map((record) => record.label_status))].sort().map((status) => [
      status,
      dataset.filter((record) => record.label_status === status).length,
    ])),
    model_counts: modelCounts,
    provenance_counts: Object.fromEntries([...new Set(dataset.map((record) => record.provenance.kind))].sort().map((kind) => [
      kind,
      dataset.filter((record) => record.provenance.kind === kind).length,
    ])),
    check_counts: checkCounts,
    results: cases,
    production_readiness_established: false,
    limitation: "Synthetic regression checks do not establish model quality, safety, calibration, or production readiness.",
  };
}

function parseArguments(argv) {
  const options = { minimumPassRate: 1, requireProvider: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["--dataset", "--outputs", "--minimum-pass-rate"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail(`missing value for ${argument}`);
      if (argument === "--dataset") options.datasetPath = value;
      if (argument === "--outputs") options.outputsPath = value;
      if (argument === "--minimum-pass-rate") options.minimumPassRate = Number(value);
      index += 1;
    } else if (argument === "--require-provider") {
      options.requireProvider = true;
    } else {
      fail("unknown command-line option");
    }
  }
  if (!options.datasetPath || !options.outputsPath) fail("--dataset and --outputs are required");
  if (!Number.isFinite(options.minimumPassRate) || options.minimumPassRate < 0 || options.minimumPassRate > 1) {
    fail("--minimum-pass-rate must be between 0 and 1");
  }
  return options;
}

function main(argv) {
  try {
    const options = parseArguments(argv);
    const dataset = readJsonl(options.datasetPath, "dataset");
    const outputs = readJsonl(options.outputsPath, "outputs");
    const report = evaluateRecords(dataset, outputs, options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.pass_rate < options.minimumPassRate) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error";
    process.stderr.write(`Evaluation failed closed: ${message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
