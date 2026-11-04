import { describe, expect, it } from "vitest";
import { eventSchema, groupSchema, memberNameSchema, placementsSchema } from "./validation";

const placements = (count: number) => Array.from({ length: count }, (_, i) => ({ userId: `p${i + 1}`, position: i + 1 }));

describe("groups and members", () => {
  it("validates group names", () => {
    expect(groupSchema.safeParse({ name: "A", description: "" }).success).toBe(false);
    const ok = groupSchema.safeParse({ name: "Friday Night", description: "" });
    expect(ok.success && ok.data.description).toBeUndefined();
  });

  it("validates member names", () => {
    expect(memberNameSchema.safeParse(" x ").success).toBe(false);
    expect(memberNameSchema.safeParse(" Anna ").data).toBe("Anna");
  });
});

describe("events", () => {
  const base = { title: "Friday", description: "", location: "", registrationDeadline: "", maxParticipants: "" };

  it("requires a start time", () => {
    expect(eventSchema.safeParse({ ...base, startsAt: "" }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, startsAt: "2026-05-01T18:00:00.000Z" }).success).toBe(true);
  });

  it("requires the deadline to be before the start and a sensible limit", () => {
    const startsAt = "2026-05-01T18:00:00.000Z";
    expect(eventSchema.safeParse({ ...base, startsAt, registrationDeadline: "2026-05-02T18:00:00.000Z" }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, startsAt, registrationDeadline: "2026-04-30T18:00:00.000Z" }).success).toBe(true);
    expect(eventSchema.safeParse({ ...base, startsAt, maxParticipants: "1" }).success).toBe(false);
  });
});

describe("tournament placements", () => {
  it.each([4, 5, 6, 7])("accepts %i players", (n) => expect(placementsSchema.safeParse(placements(n)).success).toBe(true));
  it.each([0, 3, 8])("rejects %i players", (n) => expect(placementsSchema.safeParse(placements(n)).success).toBe(false));

  it("rejects duplicate or missing positions and duplicate players", () => {
    const dupPosition = placements(4).map((p, i) => (i === 3 ? { ...p, position: 3 } : p));
    const skipped = placements(4).map((p, i) => (i === 3 ? { ...p, position: 5 } : p));
    const dupPlayer = placements(4).map((p, i) => (i === 3 ? { ...p, userId: "p1" } : p));
    for (const bad of [dupPosition, skipped, dupPlayer]) expect(placementsSchema.safeParse(bad).success).toBe(false);
  });
});
