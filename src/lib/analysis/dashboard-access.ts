export type AiDashboardSettingsState = {
  providerAvailable: boolean;
  freePlanConfirmed: boolean;
  enabled: boolean;
  hasAiPlan: boolean;
};

export type AiDashboardAccess = {
  canManage: boolean;
  canAnalyze: boolean;
  canEnable: boolean;
  canDisable: boolean;
};

export function getAiDashboardAccess(role: string, state: AiDashboardSettingsState): AiDashboardAccess {
  const canManage = role === "OWNER" || role === "ADMIN";
  const canAnalyze = (canManage || role === "MEMBER") && state.hasAiPlan;

  return {
    canManage,
    canAnalyze,
    canEnable: canManage && !state.enabled && state.providerAvailable && state.freePlanConfirmed && state.hasAiPlan,
    canDisable: canManage && state.enabled,
  };
}
