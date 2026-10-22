import { describe, expect, it } from "vitest";
import { getAiDashboardAccess } from "./dashboard-access";

describe("AI dashboard permissions", () => {
  it("lets an owner enable the provider only when it is available and confirmed", () => {
    expect(getAiDashboardAccess("OWNER", {
      providerAvailable: true,
      freePlanConfirmed: true,
      enabled: false,
      hasAiPlan: true,
    })).toEqual({ canManage: true, canAnalyze: true, canEnable: true, canDisable: false });
  });

  it("keeps provider controls off for members while allowing alert analysis", () => {
    expect(getAiDashboardAccess("MEMBER", {
      providerAvailable: true,
      freePlanConfirmed: true,
      enabled: true,
      hasAiPlan: true,
    })).toEqual({ canManage: false, canAnalyze: true, canEnable: false, canDisable: false });
  });

  it("lets administrators turn an enabled provider off even after global config is removed", () => {
    expect(getAiDashboardAccess("ADMIN", {
      providerAvailable: false,
      freePlanConfirmed: false,
      enabled: true,
      hasAiPlan: true,
    })).toEqual({ canManage: true, canAnalyze: true, canEnable: false, canDisable: true });
  });

  it("does not allow viewers to run analysis or change provider settings", () => {
    expect(getAiDashboardAccess("VIEWER", {
      providerAvailable: true,
      freePlanConfirmed: true,
      enabled: false,
      hasAiPlan: true,
    })).toEqual({ canManage: false, canAnalyze: false, canEnable: false, canDisable: false });
  });

  it("keeps analysis and enablement behind an active AI plan while allowing opt-out", () => {
    expect(getAiDashboardAccess("OWNER", {
      providerAvailable: true,
      freePlanConfirmed: true,
      enabled: false,
      hasAiPlan: false,
    })).toEqual({ canManage: true, canAnalyze: false, canEnable: false, canDisable: false });
    expect(getAiDashboardAccess("OWNER", {
      providerAvailable: true,
      freePlanConfirmed: true,
      enabled: true,
      hasAiPlan: false,
    })).toEqual({ canManage: true, canAnalyze: false, canEnable: false, canDisable: true });
  });
});
