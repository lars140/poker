export const SCORING_TABLES = {
  4: [10, 6, 3, 1],
  5: [12, 8, 5, 2, 0],
  6: [15, 10, 6, 3, 1, 0],
  7: [18, 12, 8, 4, 2, 1, 0],
} as const;

export type TournamentSize = keyof typeof SCORING_TABLES;

export function isTournamentSize(size: number): size is TournamentSize {
  return Number.isInteger(size) && size >= 4 && size <= 7;
}

export function pointsForPlacement(size: number, position: number): number {
  if (!isTournamentSize(size)) {
    throw new RangeError("Tournaments must have between 4 and 7 participants.");
  }

  if (!Number.isInteger(position) || position < 1 || position > size) {
    throw new RangeError("Finishing position must be within the tournament field.");
  }

  return SCORING_TABLES[size][position - 1];
}

export type Placement = { userId: string; position: number };

export function validatePlacements(placements: Placement[]): void {
  const size = placements.length;
  if (!isTournamentSize(size)) {
    throw new RangeError("A tournament must include 4, 5, 6, or 7 participants.");
  }

  const userIds = new Set(placements.map(({ userId }) => userId));
  const positions = new Set(placements.map(({ position }) => position));
  if (userIds.size !== size) {
    throw new Error("Each participant must appear exactly once.");
  }
  if (positions.size !== size || [...positions].some((position) => !Number.isInteger(position) || position < 1 || position > size)) {
    throw new Error("Placements must contain every unique position from 1 through the field size.");
  }
}

export function scorePlacements(placements: Placement[]) {
  validatePlacements(placements);
  return placements.map((placement) => ({
    ...placement,
    points: pointsForPlacement(placements.length, placement.position),
  }));
}
