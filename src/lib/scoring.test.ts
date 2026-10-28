import { describe, expect, it } from "vitest";
import { pointsForPlacement, scorePlacements, validatePlacements } from "./scoring";

describe("ranking points", () => {
  it.each([
    [4, [10, 6, 3, 1]],
    [5, [12, 8, 5, 2, 0]],
    [6, [15, 10, 6, 3, 1, 0]],
    [7, [18, 12, 8, 4, 2, 1, 0]],
  ])("scores a %i-player tournament", (size, expected) => {
    expect(Array.from({ length: size }, (_, index) => pointsForPlacement(size, index + 1))).toEqual(expected);
  });

  it("rejects unsupported field sizes and positions", () => {
    expect(() => pointsForPlacement(3, 1)).toThrow(RangeError);
    expect(() => pointsForPlacement(4, 5)).toThrow(RangeError);
    expect(() => pointsForPlacement(4, 1.5)).toThrow(RangeError);
  });

  it("requires every unique position and participant", () => {
    expect(() => validatePlacements([
      { userId: "a", position: 1 },
      { userId: "b", position: 1 },
      { userId: "c", position: 3 },
      { userId: "d", position: 4 },
    ])).toThrow("unique position");
    expect(() => validatePlacements([
      { userId: "a", position: 1 },
      { userId: "a", position: 2 },
      { userId: "c", position: 3 },
      { userId: "d", position: 4 },
    ])).toThrow("exactly once");
  });

  it("stores the points with each scored placement", () => {
    expect(scorePlacements([
      { userId: "a", position: 1 },
      { userId: "b", position: 2 },
      { userId: "c", position: 3 },
      { userId: "d", position: 4 },
    ])).toEqual([
      { userId: "a", position: 1, points: 10 },
      { userId: "b", position: 2, points: 6 },
      { userId: "c", position: 3, points: 3 },
      { userId: "d", position: 4, points: 1 },
    ]);
  });
});
