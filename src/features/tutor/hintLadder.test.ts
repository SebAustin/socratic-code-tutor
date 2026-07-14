import { describe, expect, it } from "vitest";
import { advanceRung, HINTS, initialRung, type HintRung } from "./hintLadder";

describe("hint ladder", () => {
  it("starts at rung 1", () => expect(initialRung()).toBe(1));
  it("escalates by exactly one", () => expect(advanceRung(1, { requested: true })).toBe(2));
  it("does not escalate without an explicit request", () => expect(advanceRung(2, { requested: false })).toBe(2));
  it("caps at rung 4", () => expect(advanceRung(4, { requested: true })).toBe(4));
  it("visits every intermediate rung", () => {
    let rung: HintRung = 1;
    for (let index = 0; index < 3; index += 1) rung = advanceRung(rung, { requested: true });
    expect(rung).toBe(4);
  });
  it("defines a distinct directive for each rung", () => expect(new Set(Object.values(HINTS).map(({ directive }) => directive)).size).toBe(4));
});
