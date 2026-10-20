import { describe, expect, it } from "vitest";
import { readBoundedJson } from "@/lib/http/bounded-json";

describe("contact request body boundary", () => {
  it("parses a bounded JSON body", async () => {
    const request = new Request("https://app.example.test/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Team", message: "Please contact us." }),
    });
    await expect(readBoundedJson(request)).resolves.toEqual({ data: { name: "Team", message: "Please contact us." } });
  });

  it("rejects simple cross-origin form content types", async () => {
    const request = new Request("https://app.example.test/api/contact", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });
    await expect(readBoundedJson(request)).resolves.toBeNull();
  });

  it("rejects oversized declared and streamed bodies", async () => {
    const declared = new Request("https://app.example.test/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "16385" },
      body: "{}",
    });
    await expect(readBoundedJson(declared)).resolves.toEqual({ tooLarge: true });

    const streamed = new Request("https://app.example.test/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(16 * 1024 + 1)); controller.close(); } }),
      // Node requires duplex for streamed request bodies.
      duplex: "half",
    } as RequestInit);
    await expect(readBoundedJson(streamed)).resolves.toEqual({ tooLarge: true });
  });
});
