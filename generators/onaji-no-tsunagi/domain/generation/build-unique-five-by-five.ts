import { indexToCell } from "../grid/coordinates.ts";
import type {
  FiveByFiveTerminalPattern,
  SymbolId,
} from "../types/puzzle.ts";
import {
  materializePathPlan,
  type MaterializedPathPlan,
  type PlannedPath,
  type RouteRole,
} from "./materialize-path-plan.ts";
import {
  createSeededRandom,
  type SeededRandom,
} from "./random.ts";

interface PathCandidate {
  readonly cells: readonly number[];
  readonly occupiedMask: number;
}

export interface FiveByFiveTerminalProfile {
  readonly pattern: FiveByFiveTerminalPattern;
  readonly terminalCount: 6 | 8 | 10;
  readonly pathCount: 3 | 4 | 5;
  readonly symbolPathCounts: readonly [number, number, number];
  readonly pathLengthProfiles: readonly (readonly number[])[];
  readonly maximumTotalTurnCount: number;
  readonly minimumForcedExitCount: number;
  readonly maximumForcedExitCount: number;
  readonly maximumLineConcentration: number;
}

export interface UniqueFiveByFiveProfile {
  readonly width: 5;
  readonly height: 5;
  readonly maximumCandidateCount: number;
  readonly maximumConstructionStates: number;
  readonly maximumValidityStates: number;
  readonly maximumProofStates: number;
  readonly minimumUsedCellCount: number;
  readonly terminalProfiles: Readonly<
    Record<FiveByFiveTerminalPattern, FiveByFiveTerminalProfile>
  >;
}

export const UNIQUE_FIVE_BY_FIVE_PROFILE: UniqueFiveByFiveProfile = {
  width: 5,
  height: 5,
  maximumCandidateCount: 30_000,
  maximumConstructionStates: 4_000,
  maximumValidityStates: 500_000,
  maximumProofStates: 500_000,
  minimumUsedCellCount: 25,
  terminalProfiles: {
    "2-2-2": {
      pattern: "2-2-2",
      terminalCount: 6,
      pathCount: 3,
      symbolPathCounts: [1, 1, 1],
      pathLengthProfiles: [
        [13, 8, 4],
        [12, 8, 5],
        [13, 7, 5],
        [12, 7, 6],
        [11, 9, 5],
        [10, 9, 6],
        [14, 7, 4],
        [13, 6, 6],
      ],
      maximumTotalTurnCount: 8,
      minimumForcedExitCount: 1,
      maximumForcedExitCount: 4,
      maximumLineConcentration: 3,
    },
    "4-2-2": {
      pattern: "4-2-2",
      terminalCount: 8,
      pathCount: 4,
      symbolPathCounts: [2, 1, 1],
      pathLengthProfiles: [
        [10, 7, 5, 3],
        [9, 7, 5, 4],
        [8, 7, 6, 4],
        [9, 6, 6, 4],
        [8, 6, 6, 5],
        [10, 6, 5, 4],
      ],
      maximumTotalTurnCount: 9,
      minimumForcedExitCount: 1,
      maximumForcedExitCount: 5,
      maximumLineConcentration: 3,
    },
    "4-4-2": {
      pattern: "4-4-2",
      terminalCount: 10,
      pathCount: 5,
      symbolPathCounts: [2, 2, 1],
      pathLengthProfiles: [
        [7, 6, 5, 4, 3],
        [8, 5, 5, 4, 3],
        [7, 5, 5, 4, 4],
        [6, 6, 5, 5, 3],
        [6, 5, 5, 5, 4],
      ],
      maximumTotalTurnCount: 10,
      minimumForcedExitCount: 1,
      maximumForcedExitCount: 6,
      maximumLineConcentration: 4,
    },
  },
};

const SYMBOLS: readonly SymbolId[] = ["circle", "square", "triangle"];
const PATHS_BY_LENGTH = enumerateLowTurnPaths();
const PATHS_BY_LENGTH_AND_MASK = indexPathsByLengthAndMask(
  PATHS_BY_LENGTH,
);
const FULL_BOARD_MASK = (1 << 25) - 1;

export function getFiveByFiveTerminalProfile(
  pattern: FiveByFiveTerminalPattern,
): FiveByFiveTerminalProfile {
  return UNIQUE_FIVE_BY_FIVE_PROFILE.terminalProfiles[pattern];
}

export function selectFiveByFiveTerminalPattern(
  requestSeed: string,
  puzzleIndex: number,
  puzzleCount: number,
): FiveByFiveTerminalPattern {
  const sequences: Readonly<
    Record<number, readonly FiveByFiveTerminalPattern[]>
  > = {
    2: ["4-2-2", "4-4-2"],
    3: ["2-2-2", "4-2-2", "4-4-2"],
    4: ["2-2-2", "4-2-2", "4-2-2", "4-4-2"],
  };
  const sequence = sequences[puzzleCount];
  if (sequence !== undefined) {
    const selected = sequence[puzzleIndex];
    if (selected === undefined) {
      throw new RangeError("puzzle index is outside the worksheet");
    }
    return selected;
  }
  if (puzzleCount !== 1 || puzzleIndex !== 0) {
    throw new RangeError("unsupported worksheet puzzle count");
  }
  const choices: readonly FiveByFiveTerminalPattern[] = [
    "2-2-2",
    "4-2-2",
    "4-4-2",
  ];
  const random = createSeededRandom(`${requestSeed}::terminal-pattern`);
  return choices[random.integer(0, choices.length - 1)] ?? "2-2-2";
}

export function buildUniqueFiveByFive(
  puzzleSeed: string,
  random: SeededRandom,
  pattern: FiveByFiveTerminalPattern = "2-2-2",
): MaterializedPathPlan | null {
  const profile = getFiveByFiveTerminalProfile(pattern);
  const lengths = profile.pathLengthProfiles[
    random.integer(0, profile.pathLengthProfiles.length - 1)
  ];
  if (
    lengths === undefined
    || lengths.length !== profile.pathCount
    || lengths.reduce((sum, length) => sum + length, 0) !== 25
  ) {
    return null;
  }
  const selected = selectPathCover(lengths, random);
  if (selected === null) {
    return null;
  }
  const symbolSlots = random.shuffle(
    random.shuffle(SYMBOLS).flatMap((symbol, symbolIndex) => (
      Array.from(
        { length: profile.symbolPathCounts[symbolIndex] ?? 0 },
        () => symbol,
      )
    )),
  );
  if (symbolSlots.length !== profile.pathCount) {
    throw new TypeError("terminal profile does not match its path count");
  }
  const paths: readonly PlannedPath[] = selected.map((candidate, index) => ({
    role: roleForIndex(index),
    symbol: symbolSlots[index] ?? "circle",
    cells: candidate.cells.map((cellIndex) => indexToCell(cellIndex, 5)),
  }));
  return materializePathPlan(paths, 5, 5, puzzleSeed);
}

function selectPathCover(
  lengths: readonly number[],
  random: SeededRandom,
): readonly PathCandidate[] | null {
  const firstLength = lengths[0];
  if (firstLength === undefined) {
    return null;
  }
  const first = selectRandom(PATHS_BY_LENGTH.get(firstLength) ?? [], random);
  if (first === undefined) {
    return null;
  }
  const selected: PathCandidate[] = [first];
  let exploredStateCount = 0;
  const found = search(
    1,
    FULL_BOARD_MASK & ~first.occupiedMask,
  );
  return found ? selected : null;

  function search(position: number, remainingMask: number): boolean {
    const length = lengths[position];
    if (length === undefined) {
      return remainingMask === 0;
    }
    if (position === lengths.length - 1) {
      const candidates = (
        PATHS_BY_LENGTH_AND_MASK.get(length)?.get(remainingMask) ?? []
      );
      const selectedLast = selectRandom(candidates, random);
      if (selectedLast === undefined) {
        return false;
      }
      selected.push(selectedLast);
      return true;
    }
    const candidates = random.shuffle(
      (PATHS_BY_LENGTH.get(length) ?? []).filter((candidate) => (
        (candidate.occupiedMask & remainingMask)
          === candidate.occupiedMask
      )),
    );
    for (const candidate of candidates) {
      exploredStateCount += 1;
      if (
        exploredStateCount
          > UNIQUE_FIVE_BY_FIVE_PROFILE.maximumConstructionStates
      ) {
        return false;
      }
      selected.push(candidate);
      if (search(
        position + 1,
        remainingMask & ~candidate.occupiedMask,
      )) {
        return true;
      }
      selected.pop();
    }
    return false;
  }
}

function roleForIndex(index: number): RouteRole {
  if (index === 0) {
    return "thread";
  }
  if (index === 1) {
    return "spine";
  }
  return "scaffold";
}

function enumerateLowTurnPaths(): ReadonlyMap<number, readonly PathCandidate[]> {
  const maximumEdges = 14;
  const maximumTurns = 4;
  const pathBySignature = new Map<string, PathCandidate>();
  for (let start = 0; start < 25; start += 1) {
    visit([start], -1, 0);
  }
  const byLength = new Map<number, PathCandidate[]>();
  for (const candidate of pathBySignature.values()) {
    if (candidate.cells.length < 3) {
      continue;
    }
    const bucket = byLength.get(candidate.cells.length) ?? [];
    bucket.push(candidate);
    byLength.set(candidate.cells.length, bucket);
  }
  return byLength;

  function visit(
    cells: readonly number[],
    previousDirection: number,
    turnCount: number,
  ): void {
    const current = cells.at(-1);
    if (current === undefined) {
      return;
    }
    if (cells.length >= 2) {
      const forward = cells.join(".");
      const reverse = [...cells].reverse().join(".");
      const signature = forward.localeCompare(reverse) <= 0
        ? forward
        : reverse;
      pathBySignature.set(signature, {
        cells: [...cells],
        occupiedMask: cells.reduce(
          (mask, cellIndex) => mask | (1 << cellIndex),
          0,
        ),
      });
    }
    if (cells.length - 1 >= maximumEdges) {
      return;
    }
    for (const next of adjacentIndices(current)) {
      if (cells.includes(next)) {
        continue;
      }
      const direction = directionBetween(current, next);
      const nextTurnCount = (
        previousDirection >= 0
        && direction !== previousDirection
      )
        ? turnCount + 1
        : turnCount;
      if (nextTurnCount > maximumTurns) {
        continue;
      }
      visit([...cells, next], direction, nextTurnCount);
    }
  }
}

function indexPathsByLengthAndMask(
  pathsByLength: ReadonlyMap<number, readonly PathCandidate[]>,
): ReadonlyMap<number, ReadonlyMap<number, readonly PathCandidate[]>> {
  const result = new Map<number, Map<number, PathCandidate[]>>();
  for (const [length, paths] of pathsByLength) {
    const pathsByMask = result.get(length) ?? new Map<number, PathCandidate[]>();
    for (const path of paths) {
      const candidates = pathsByMask.get(path.occupiedMask) ?? [];
      candidates.push(path);
      pathsByMask.set(path.occupiedMask, candidates);
    }
    result.set(length, pathsByMask);
  }
  return result;
}

function adjacentIndices(index: number): readonly number[] {
  const row = Math.floor(index / 5);
  const column = index % 5;
  return [
    row > 0 ? index - 5 : -1,
    column > 0 ? index - 1 : -1,
    column < 4 ? index + 1 : -1,
    row < 4 ? index + 5 : -1,
  ].filter((candidate) => candidate >= 0);
}

function directionBetween(first: number, second: number): number {
  if (second === first - 5) {
    return 0;
  }
  if (second === first + 1) {
    return 1;
  }
  if (second === first + 5) {
    return 2;
  }
  return 3;
}

function selectRandom<T>(
  values: readonly T[],
  random: SeededRandom,
): T | undefined {
  return values.length === 0
    ? undefined
    : values[random.integer(0, values.length - 1)];
}
