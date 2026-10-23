import { describe, expect, it } from "vitest";
import { DEVOBS_CATALOG, DEVOBS_SOURCE_SHA, getDevobsSourceUrl } from "./catalog";

describe("Devobs source catalog", () => {
  it("uses unique entries and links every claim to the pinned source revision", () => {
    expect(new Set(DEVOBS_CATALOG.map(({ id }) => id)).size).toBe(DEVOBS_CATALOG.length);
    for (const entry of DEVOBS_CATALOG) {
      expect(entry.title.trim()).not.toBe("");
      expect(entry.summary.trim()).not.toBe("");
      expect(entry.capabilities.length).toBeGreaterThan(0);
      expect(entry.sourceStatus).toBe("VERIFIED (source)");
      expect(entry.runtimeStatus).toBe("UNVERIFIED");
      expect(getDevobsSourceUrl(entry.sourcePath)).toBe(
        `https://github.com/hamedonassar95/Devobs/blob/${DEVOBS_SOURCE_SHA}/${entry.sourcePath}`,
      );
    }
  });

  it("does not claim that the source catalog proves live runtime status", () => {
    expect(DEVOBS_CATALOG.every(({ runtimeStatus }) => runtimeStatus === "UNVERIFIED")).toBe(true);
  });
});
