type AlertForRuleAnalysis = {
  title: string;
  description: string | null;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  sourceProvider?: "PROMETHEUS" | "GRAFANA" | null;
};

export type RuleBasedAnalysis = {
  summary: string;
  details: {
    engine: "local-rules-v1";
    severity: AlertForRuleAnalysis["severity"];
    status: AlertForRuleAnalysis["status"];
    sourceProvider: NonNullable<AlertForRuleAnalysis["sourceProvider"]> | null;
    nextSteps: string[];
    note: string;
  };
};

const baseChecks = [
  "Confirm the affected service, time window, and customer impact.",
  "Compare the alert start time with recent deployments and configuration changes.",
  "Record the evidence and owner before making a production change.",
];

function topicChecks(text: string): string[] {
  if (/database|postgres|sql|connection pool/i.test(text)) {
    return ["Check database health, connection saturation, and the latest slow-query or error logs."];
  }
  if (/memory|oom|heap/i.test(text)) {
    return ["Check memory usage, recent workload growth, and out-of-memory restarts before raising limits."];
  }
  if (/cpu|load|latency|timeout/i.test(text)) {
    return ["Check CPU saturation, request latency, and dependency latency over the alert window."];
  }
  if (/disk|storage|filesystem/i.test(text)) {
    return ["Check disk capacity, growth rate, and log or temporary-file retention before cleanup."];
  }
  return ["Inspect the source alert's related metrics and logs, then compare them with the normal baseline."];
}

export function analyzeAlertWithLocalRules(alert: AlertForRuleAnalysis): RuleBasedAnalysis {
  const severityAdvice = alert.severity === "CRITICAL"
    ? "Treat this as urgent: confirm impact and use the team's documented mitigation or rollback procedure."
    : alert.severity === "WARNING"
      ? "Investigate the trend and confirm whether the condition is worsening before changing production."
      : "Review the event in context and monitor for related symptoms.";
  const nextSteps = [severityAdvice, ...topicChecks(`${alert.title} ${alert.description ?? ""}`), ...baseChecks];
  return {
    summary: `${alert.severity} alert triage guidance: ${nextSteps[0]}`,
    details: {
      engine: "local-rules-v1",
      severity: alert.severity,
      status: alert.status,
      sourceProvider: alert.sourceProvider ?? null,
      nextSteps,
      note: "Generated locally from fixed rules. No AI model or external provider was called, and no alert data left the application.",
    },
  };
}
