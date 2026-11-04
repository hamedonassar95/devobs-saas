import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/openssf-scorecard.yml"),
  "utf8",
);

describe("OpenSSF Scorecard workflow", () => {
  it("runs manually and calls the reviewed shared workflow at an immutable SHA", () => {
    expect(workflow).toContain("on:\n  workflow_dispatch:\n");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("permissions: {}");
    for (const permission of ["checks", "contents", "issues", "pull-requests"]) {
      expect(workflow).toContain(`${permission}: read`);
    }
    expect(workflow).toContain(
      "uses: hamedonassar95/Devobs/.github/workflows/reusable-openssf-scorecard.yml@783a3d329d829e9c2f10cbd33fa6abe77abda846",
    );
    expect(workflow).toContain("upload_report_artifact: false");
    expect(workflow).not.toContain(": write");
  });
});
