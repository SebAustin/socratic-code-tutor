import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("health route", () => {
  it("returns 200 without an external dependency", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "socratic-code-tutor" });
  });
});
