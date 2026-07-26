import { indexToCell } from "../grid/coordinates.ts";
import type {
  SymbolId,
  TerminalMultiplicityPattern,
  UniquePathCoverProfileId,
} from "../types/puzzle.ts";
import type { AvailableDifficultyLevel } from "../types/generation.ts";
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
  readonly occupiedMask: bigint;
}

interface PathCandidateSource {
  candidatesFor(
    length: number,
    remainingMask: bigint,
  ): readonly PathCandidate[];
}

export interface UniquePathCoverProfile {
  readonly profileId: UniquePathCoverProfileId;
  readonly width: number;
  readonly height: number;
  readonly terminalPattern: TerminalMultiplicityPattern;
  readonly terminalCount: number;
  readonly symbolPathCounts: readonly [number, number, number];
  readonly pathCount: number;
  readonly pathLengthProfiles: readonly (readonly number[])[];
  readonly maximumPathTurnCount: number;
  readonly minimumUsedCellCount: number;
  readonly maximumUsedCellCount: number;
  readonly maximumTotalTurnCount: number;
  readonly minimumForcedExitCount: number;
  readonly maximumForcedExitCount: number;
  readonly maximumLineConcentration: number;
  readonly maximumCandidateCount: number;
  readonly maximumConstructionStates: number;
  readonly maximumValidityStates: number;
  readonly maximumProofStates: number;
}

type BuildUniquePathCoverResult =
  | {
      readonly status: "built";
      readonly plan: MaterializedPathPlan;
      readonly constructionStateCount: number;
      readonly pathLengthProfile: readonly number[];
    }
  | {
      readonly status: "not_constructed";
      readonly constructionStateCount: number;
    }
  | {
      readonly status: "budget_exhausted";
      readonly constructionStateCount: number;
    };

const FIVE_BY_FIVE_PROFILES = {
  "5x5-2-2-2": {
    profileId: "5x5-2-2-2",
    width: 5,
    height: 5,
    terminalPattern: "2-2-2",
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
    maximumPathTurnCount: 4,
    minimumUsedCellCount: 25,
    maximumUsedCellCount: 25,
    maximumTotalTurnCount: 8,
    minimumForcedExitCount: 1,
    maximumForcedExitCount: 4,
    maximumLineConcentration: 3,
    maximumCandidateCount: 30_000,
    maximumConstructionStates: 4_000,
    maximumValidityStates: 500_000,
    maximumProofStates: 500_000,
  },
  "5x5-4-2-2": {
    profileId: "5x5-4-2-2",
    width: 5,
    height: 5,
    terminalPattern: "4-2-2",
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
    maximumPathTurnCount: 4,
    minimumUsedCellCount: 25,
    maximumUsedCellCount: 25,
    maximumTotalTurnCount: 9,
    minimumForcedExitCount: 1,
    maximumForcedExitCount: 5,
    maximumLineConcentration: 3,
    maximumCandidateCount: 30_000,
    maximumConstructionStates: 4_000,
    maximumValidityStates: 500_000,
    maximumProofStates: 500_000,
  },
  "5x5-4-4-2": {
    profileId: "5x5-4-4-2",
    width: 5,
    height: 5,
    terminalPattern: "4-4-2",
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
    maximumPathTurnCount: 4,
    minimumUsedCellCount: 25,
    maximumUsedCellCount: 25,
    maximumTotalTurnCount: 10,
    minimumForcedExitCount: 1,
    maximumForcedExitCount: 6,
    maximumLineConcentration: 4,
    maximumCandidateCount: 30_000,
    maximumConstructionStates: 4_000,
    maximumValidityStates: 500_000,
    maximumProofStates: 500_000,
  },
} as const satisfies Readonly<
  Record<string, UniquePathCoverProfile>
>;

const SIX_BY_SIX_PROFILES = {
  "6x6-4-4-2": {
    profileId: "6x6-4-4-2",
    width: 6,
    height: 6,
    terminalPattern: "4-4-2",
    terminalCount: 10,
    pathCount: 5,
    symbolPathCounts: [2, 2, 1],
    pathLengthProfiles: [
      [10, 8, 7, 6, 5],
      [9, 8, 7, 6, 6],
      [9, 9, 7, 6, 5],
      [8, 8, 7, 7, 6],
    ],
    maximumPathTurnCount: 4,
    minimumUsedCellCount: 36,
    maximumUsedCellCount: 36,
    maximumTotalTurnCount: 14,
    minimumForcedExitCount: 1,
    maximumForcedExitCount: 6,
    maximumLineConcentration: 5,
    maximumCandidateCount: 10_000,
    maximumConstructionStates: 30_000,
    maximumValidityStates: 50_000,
    maximumProofStates: 50_000,
  },
  "6x6-4-4-4": {
    profileId: "6x6-4-4-4",
    width: 6,
    height: 6,
    terminalPattern: "4-4-4",
    terminalCount: 12,
    pathCount: 6,
    symbolPathCounts: [2, 2, 2],
    pathLengthProfiles: [
      [8, 7, 6, 6, 5, 4],
      [7, 7, 6, 6, 5, 5],
      [8, 6, 6, 6, 5, 5],
      [7, 7, 7, 5, 5, 5],
    ],
    maximumPathTurnCount: 4,
    minimumUsedCellCount: 36,
    maximumUsedCellCount: 36,
    maximumTotalTurnCount: 15,
    minimumForcedExitCount: 1,
    maximumForcedExitCount: 10,
    maximumLineConcentration: 6,
    maximumCandidateCount: 10_000,
    maximumConstructionStates: 30_000,
    maximumValidityStates: 30_000,
    maximumProofStates: 30_000,
  },
  "6x6-6-4-4": {
    profileId: "6x6-6-4-4",
    width: 6,
    height: 6,
    terminalPattern: "6-4-4",
    terminalCount: 14,
    pathCount: 7,
    symbolPathCounts: [3, 2, 2],
    pathLengthProfiles: [
      [7, 6, 5, 5, 5, 4, 4],
      [6, 6, 6, 5, 5, 4, 4],
      [6, 5, 5, 5, 5, 5, 5],
      [7, 5, 5, 5, 5, 5, 4],
    ],
    maximumPathTurnCount: 4,
    minimumUsedCellCount: 36,
    maximumUsedCellCount: 36,
    maximumTotalTurnCount: 16,
    minimumForcedExitCount: 1,
    maximumForcedExitCount: 10,
    maximumLineConcentration: 6,
    maximumCandidateCount: 10_000,
    maximumConstructionStates: 30_000,
    maximumValidityStates: 10_000,
    maximumProofStates: 10_000,
  },
} as const satisfies Readonly<
  Record<string, UniquePathCoverProfile>
>;

const UNIQUE_PATH_COVER_PROFILES = {
  ...FIVE_BY_FIVE_PROFILES,
  ...SIX_BY_SIX_PROFILES,
} as const satisfies Readonly<
  Record<UniquePathCoverProfileId, UniquePathCoverProfile>
>;

const SYMBOLS: readonly SymbolId[] = ["circle", "square", "triangle"];
const sourceByGeometry = new Map<string, PathCandidateSource>();
const symbolAssignmentsByPathCounts = new Map<
  string,
  readonly (readonly number[])[]
>();
let lastSixBySixRouteCover:
  | {
      readonly cacheKey: string;
      readonly lengths: readonly number[];
      readonly result: PathCoverResult;
    }
  | undefined;

export function getUniquePathCoverProfile(
  profileId: UniquePathCoverProfileId,
): UniquePathCoverProfile {
  return UNIQUE_PATH_COVER_PROFILES[profileId];
}

export function getSymbolAssignmentVariantCount(
  profileId: UniquePathCoverProfileId,
): number {
  const profile = getUniquePathCoverProfile(profileId);
  return enumerateSymbolAssignments(profile.symbolPathCounts).length;
}

export function selectUniquePathCoverProfileId(
  difficulty: AvailableDifficultyLevel,
  requestSeed: string,
  puzzleIndex: number,
  puzzleCount: number,
): UniquePathCoverProfileId {
  if (difficulty === 1) {
    return selectFiveByFiveProfileId(requestSeed, puzzleIndex, puzzleCount);
  }
  if (difficulty === 2) {
    const sequences: Readonly<Record<number, readonly UniquePathCoverProfileId[]>> = {
      2: ["6x6-4-4-2", "6x6-4-4-4"],
      3: ["6x6-4-4-2", "6x6-4-4-4", "6x6-4-4-4"],
      4: [
        "6x6-4-4-2",
        "6x6-4-4-4",
        "6x6-4-4-2",
        "6x6-4-4-4",
      ],
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
    const random = createSeededRandom(`${requestSeed}::terminal-profile`);
    return random.integer(0, 1) === 0
      ? "6x6-4-4-2"
      : "6x6-4-4-4";
  }
  if (difficulty === 3) {
    if (puzzleIndex < 0 || puzzleIndex >= puzzleCount) {
      throw new RangeError("puzzle index is outside the worksheet");
    }
    return "6x6-6-4-4";
  }
  throw new RangeError("unsupported difficulty");
}

export function buildUniquePathCover(
  routeSeed: string,
  random: SeededRandom,
  profileId: UniquePathCoverProfileId,
  options: {
    readonly symbolAssignmentVariant?: number;
    readonly materializedPuzzleSeed?: string;
  } = {},
): BuildUniquePathCoverResult {
  const profile = getUniquePathCoverProfile(profileId);
  const cellCount = profile.width * profile.height;
  const cacheKey = `${profileId}|${routeSeed}`;
  let lengths: readonly number[];
  let selected: PathCoverResult;
  if (
    profile.width === 6
    && lastSixBySixRouteCover?.cacheKey === cacheKey
  ) {
    lengths = lastSixBySixRouteCover.lengths;
    selected = lastSixBySixRouteCover.result;
  } else {
    lengths = profile.pathLengthProfiles[
      random.integer(0, profile.pathLengthProfiles.length - 1)
    ] ?? [];
    const source = getPathCandidateSource(profile);
    selected = selectPathCover(lengths, random, profile, source);
    if (profile.width === 6) {
      lastSixBySixRouteCover = { cacheKey, lengths, result: selected };
    }
  }
  if (
    lengths.length !== profile.pathCount
    || lengths.reduce((sum, length) => sum + length, 0) !== cellCount
  ) {
    return { status: "not_constructed", constructionStateCount: 0 };
  }
  if (selected.status !== "built") {
    return selected;
  }
  const symbolSlots = profile.width === 5
    ? random.shuffle(
        random.shuffle(SYMBOLS).flatMap((symbol, symbolIndex) => (
          Array.from(
            { length: profile.symbolPathCounts[symbolIndex] ?? 0 },
            () => symbol,
          )
        )),
      )
    : selectSixBySixSymbolAssignment(
        routeSeed,
        profile.symbolPathCounts,
        options.symbolAssignmentVariant ?? 0,
      );
  if (symbolSlots.length !== profile.pathCount) {
    throw new TypeError("terminal profile does not match its path count");
  }
  const paths: readonly PlannedPath[] = selected.paths.map(
    (candidate, index) => ({
      role: roleForIndex(index),
      symbol: symbolSlots[index] ?? "circle",
      cells: candidate.cells.map((cellIndex) => (
        indexToCell(cellIndex, profile.width)
      )),
    }),
  );
  return {
    status: "built",
    plan: materializePathPlan(
      paths,
      profile.width,
      profile.height,
      options.materializedPuzzleSeed ?? routeSeed,
    ),
    constructionStateCount: selected.constructionStateCount,
    pathLengthProfile: [...lengths],
  };
}

function selectSixBySixSymbolAssignment(
  routeSeed: string,
  pathCounts: readonly [number, number, number],
  variant: number,
): readonly SymbolId[] {
  const assignments = enumerateSymbolAssignments(pathCounts);
  if (assignments.length === 0) {
    return [];
  }
  const random = createSeededRandom(`${routeSeed}::symbol-assignment-order`);
  const offset = random.integer(0, assignments.length - 1);
  const step = coprimeStep(
    random.integer(1, assignments.length),
    assignments.length,
  );
  const assignment = assignments[
    (offset + variant * step) % assignments.length
  ] ?? [];
  const symbolOrder = createSeededRandom(
    `${routeSeed}::symbol-labels`,
  ).shuffle(SYMBOLS);
  return assignment.map((groupIndex) => (
    symbolOrder[groupIndex] ?? "circle"
  ));
}

function enumerateSymbolAssignments(
  pathCounts: readonly [number, number, number],
): readonly (readonly number[])[] {
  const key = pathCounts.join("-");
  const cached = symbolAssignmentsByPathCounts.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const pathCount = pathCounts.reduce((sum, count) => sum + count, 0);
  const assignments: number[][] = [];
  assignGroup(0, Array.from({ length: pathCount }, (_, index) => index), []);
  symbolAssignmentsByPathCounts.set(key, assignments);
  return assignments;

  function assignGroup(
    groupIndex: number,
    remainingIndices: readonly number[],
    groups: readonly (readonly number[])[],
  ): void {
    const groupSize = pathCounts[groupIndex];
    if (groupSize === undefined) {
      const assignment = Array.from({ length: pathCount }, () => -1);
      groups.forEach((indices, index) => {
        for (const pathIndex of indices) {
          assignment[pathIndex] = index;
        }
      });
      assignments.push(assignment);
      return;
    }
    for (const selected of combinations(remainingIndices, groupSize)) {
      const previous = groups[groupIndex - 1];
      if (
        previous !== undefined
        && pathCounts[groupIndex - 1] === groupSize
        && compareNumberArrays(previous, selected) >= 0
      ) {
        continue;
      }
      const selectedSet = new Set(selected);
      assignGroup(
        groupIndex + 1,
        remainingIndices.filter((index) => !selectedSet.has(index)),
        [...groups, selected],
      );
    }
  }
}

function combinations(
  values: readonly number[],
  size: number,
): readonly (readonly number[])[] {
  const result: number[][] = [];
  choose(0, []);
  return result;

  function choose(start: number, selected: readonly number[]): void {
    if (selected.length === size) {
      result.push([...selected]);
      return;
    }
    const needed = size - selected.length;
    for (
      let index = start;
      index <= values.length - needed;
      index += 1
    ) {
      const value = values[index];
      if (value !== undefined) {
        choose(index + 1, [...selected, value]);
      }
    }
  }
}

function compareNumberArrays(
  left: readonly number[],
  right: readonly number[],
): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}

function coprimeStep(candidate: number, modulus: number): number {
  let step = Math.max(1, candidate % modulus);
  while (greatestCommonDivisor(step, modulus) !== 1) {
    step = (step + 1) % modulus;
    if (step === 0) {
      step = 1;
    }
  }
  return step;
}

function greatestCommonDivisor(first: number, second: number): number {
  let left = first;
  let right = second;
  while (right !== 0) {
    [left, right] = [right, left % right];
  }
  return Math.abs(left);
}

function selectFiveByFiveProfileId(
  requestSeed: string,
  puzzleIndex: number,
  puzzleCount: number,
): UniquePathCoverProfileId {
  const sequences: Readonly<Record<number, readonly UniquePathCoverProfileId[]>> = {
    2: ["5x5-4-2-2", "5x5-4-4-2"],
    3: ["5x5-2-2-2", "5x5-4-2-2", "5x5-4-4-2"],
    4: ["5x5-2-2-2", "5x5-4-2-2", "5x5-4-2-2", "5x5-4-4-2"],
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
  const choices: readonly UniquePathCoverProfileId[] = [
    "5x5-2-2-2",
    "5x5-4-2-2",
    "5x5-4-4-2",
  ];
  const random = createSeededRandom(`${requestSeed}::terminal-pattern`);
  return choices[random.integer(0, choices.length - 1)] ?? "5x5-2-2-2";
}

function getPathCandidateSource(
  profile: UniquePathCoverProfile,
): PathCandidateSource {
  const key = [
    profile.width,
    profile.height,
    profile.maximumPathTurnCount,
  ].join("x");
  const existing = sourceByGeometry.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created = createLazyPathCandidateSource(
    profile.width,
    profile.height,
    profile.maximumPathTurnCount,
  );
  sourceByGeometry.set(key, created);
  return created;
}

function createLazyPathCandidateSource(
  width: number,
  height: number,
  maximumTurnCount: number,
): PathCandidateSource {
  if (width === 5 && height === 5) {
    let legacyPaths:
      | ReadonlyMap<number, readonly PathCandidate[]>
      | undefined;
    return {
      candidatesFor(length, remainingMask) {
        legacyPaths ??= enumerateLowTurnPathsByLength(
          width,
          height,
          14,
          maximumTurnCount,
        );
        return (legacyPaths.get(length) ?? []).filter((candidate) => (
          (candidate.occupiedMask & remainingMask)
            === candidate.occupiedMask
        ));
      },
    };
  }
  const pathsByLength = new Map<number, readonly PathCandidate[]>();
  return {
    candidatesFor(length, remainingMask) {
      let candidates = pathsByLength.get(length);
      if (candidates === undefined) {
        candidates = enumerateLowTurnPathsOfLength(
          width,
          height,
          length,
          maximumTurnCount,
        );
        pathsByLength.set(length, candidates);
      }
      return candidates.filter((candidate) => (
        (candidate.occupiedMask & remainingMask)
          === candidate.occupiedMask
      ));
    },
  };
}

function enumerateLowTurnPathsByLength(
  width: number,
  height: number,
  maximumEdgeCount: number,
  maximumTurnCount: number,
): ReadonlyMap<number, readonly PathCandidate[]> {
  const cellCount = width * height;
  const pathBySignature = new Map<string, PathCandidate>();
  for (let start = 0; start < cellCount; start += 1) {
    visit([start], 0n, -1, 0);
  }
  const pathsByLength = new Map<number, PathCandidate[]>();
  for (const candidate of pathBySignature.values()) {
    if (candidate.cells.length < 3) {
      continue;
    }
    const bucket = pathsByLength.get(candidate.cells.length) ?? [];
    bucket.push(candidate);
    pathsByLength.set(candidate.cells.length, bucket);
  }
  return pathsByLength;

  function visit(
    cells: readonly number[],
    occupiedMask: bigint,
    previousDirection: number,
    turnCount: number,
  ): void {
    const current = cells.at(-1);
    if (current === undefined) {
      return;
    }
    const nextMask = occupiedMask | bitFor(current);
    if (cells.length >= 2) {
      const forward = cells.join(".");
      const reverse = [...cells].reverse().join(".");
      const signature = forward.localeCompare(reverse) <= 0
        ? forward
        : reverse;
      pathBySignature.set(signature, {
        cells: [...cells],
        occupiedMask: nextMask,
      });
    }
    if (cells.length - 1 >= maximumEdgeCount) {
      return;
    }
    for (const next of adjacentIndices(current, width, height)) {
      if ((nextMask & bitFor(next)) !== 0n) {
        continue;
      }
      const direction = directionBetween(current, next, width);
      const nextTurnCount = (
        previousDirection >= 0
        && direction !== previousDirection
      )
        ? turnCount + 1
        : turnCount;
      if (nextTurnCount > maximumTurnCount) {
        continue;
      }
      visit([...cells, next], nextMask, direction, nextTurnCount);
    }
  }
}

function enumerateLowTurnPathsOfLength(
  width: number,
  height: number,
  targetLength: number,
  maximumTurnCount: number,
): readonly PathCandidate[] {
  const cellCount = width * height;
  const pathBySignature = new Map<string, PathCandidate>();
  for (let start = 0; start < cellCount; start += 1) {
    visit([start], 0n, -1, 0);
  }
  return [...pathBySignature.values()];

  function visit(
    cells: readonly number[],
    occupiedMask: bigint,
    previousDirection: number,
    turnCount: number,
  ): void {
    const current = cells.at(-1);
    if (current === undefined) {
      return;
    }
    const nextMask = occupiedMask | bitFor(current);
    if (cells.length === targetLength) {
      if (hasUnitBay(cells, width)) {
        return;
      }
      const forward = cells.join(".");
      const reverse = [...cells].reverse().join(".");
      const signature = forward.localeCompare(reverse) <= 0
        ? forward
        : reverse;
      pathBySignature.set(signature, {
        cells: [...cells],
        occupiedMask: nextMask,
      });
      return;
    }
    for (const next of adjacentIndices(current, width, height)) {
      if ((nextMask & bitFor(next)) !== 0n) {
        continue;
      }
      const direction = directionBetween(current, next, width);
      const nextTurnCount = (
        previousDirection >= 0
        && direction !== previousDirection
      )
        ? turnCount + 1
        : turnCount;
      if (nextTurnCount > maximumTurnCount) {
        continue;
      }
      visit([...cells, next], nextMask, direction, nextTurnCount);
    }
  }
}

function hasUnitBay(cells: readonly number[], width: number): boolean {
  for (let index = 3; index < cells.length; index += 1) {
    const first = cells[index - 3];
    const last = cells[index];
    if (
      first !== undefined
      && last !== undefined
      && (
        Math.abs(Math.floor(first / width) - Math.floor(last / width))
        + Math.abs((first % width) - (last % width))
      ) === 1
    ) {
      return true;
    }
  }
  return false;
}

type PathCoverResult =
  | {
      readonly status: "built";
      readonly paths: readonly PathCandidate[];
      readonly constructionStateCount: number;
    }
  | {
      readonly status: "not_constructed";
      readonly constructionStateCount: number;
    }
  | {
      readonly status: "budget_exhausted";
      readonly constructionStateCount: number;
    };

function selectPathCover(
  lengths: readonly number[],
  random: SeededRandom,
  profile: UniquePathCoverProfile,
  source: PathCandidateSource,
): PathCoverResult {
  const fullBoardMask = fullMask(profile.width * profile.height);
  const firstLength = lengths[0];
  if (firstLength === undefined) {
    return { status: "not_constructed", constructionStateCount: 0 };
  }
  const first = selectRandom(
    source.candidatesFor(firstLength, fullBoardMask),
    random,
  );
  if (first === undefined) {
    return { status: "not_constructed", constructionStateCount: 0 };
  }
  const selected: PathCandidate[] = [first];
  let constructionStateCount = 0;
  let budgetExhausted = false;
  const found = search(
    lengths.slice(1),
    fullBoardMask & ~first.occupiedMask,
  );
  if (found) {
    return { status: "built", paths: selected, constructionStateCount };
  }
  return {
    status: budgetExhausted ? "budget_exhausted" : "not_constructed",
    constructionStateCount,
  };

  function search(
    remainingLengths: readonly number[],
    remainingMask: bigint,
  ): boolean {
    if (budgetExhausted) {
      return false;
    }
    if (remainingLengths.length === 0) {
      return remainingMask === 0n;
    }
    if (
      popcount(remainingMask)
        !== remainingLengths.reduce((sum, length) => sum + length, 0)
      || (
        profile.width !== 5
        && !componentsCanStillBeCovered(
          remainingMask,
          remainingLengths,
          profile.width,
          profile.height,
        )
      )
    ) {
      return false;
    }
    const options = remainingLengths.map((length, index) => ({
      length,
      index,
      candidates: source.candidatesFor(length, remainingMask),
    }));
    const selectedOption = profile.width === 5
      ? options[0]
      : options.toSorted((left, right) => (
          left.candidates.length - right.candidates.length
          || left.index - right.index
        ))[0];
    if (selectedOption === undefined || selectedOption.candidates.length === 0) {
      return false;
    }
    const nextLengths = remainingLengths.filter(
      (_, index) => index !== selectedOption.index,
    );
    if (nextLengths.length === 0) {
      const exact = selectedOption.candidates.filter(
        (candidate) => candidate.occupiedMask === remainingMask,
      );
      const selectedLast = selectRandom(exact, random);
      if (selectedLast === undefined) {
        return false;
      }
      selected.push(selectedLast);
      return true;
    }
    for (const candidate of random.shuffle(selectedOption.candidates)) {
      constructionStateCount += 1;
      if (constructionStateCount > profile.maximumConstructionStates) {
        budgetExhausted = true;
        return false;
      }
      selected.push(candidate);
      if (search(
        nextLengths,
        remainingMask & ~candidate.occupiedMask,
      )) {
        return true;
      }
      selected.pop();
      if (budgetExhausted) {
        return false;
      }
    }
    return false;
  }
}

function componentsCanStillBeCovered(
  remainingMask: bigint,
  remainingLengths: readonly number[],
  width: number,
  height: number,
): boolean {
  const componentSizes: number[] = [];
  let unvisited = remainingMask;
  while (unvisited !== 0n) {
    const start = firstSetBit(unvisited);
    const queue = [start];
    unvisited &= ~bitFor(start);
    let size = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current === undefined) {
        continue;
      }
      size += 1;
      for (const next of adjacentIndices(current, width, height)) {
        const nextBit = bitFor(next);
        if ((unvisited & nextBit) === 0n) {
          continue;
        }
        unvisited &= ~nextBit;
        queue.push(next);
      }
    }
    componentSizes.push(size);
  }
  if (componentSizes.length > remainingLengths.length) {
    return false;
  }
  const minimumLength = Math.min(...remainingLengths);
  return componentSizes.every((size) => size >= minimumLength);
}

function firstSetBit(mask: bigint): number {
  let index = 0;
  let value = mask;
  while ((value & 1n) === 0n) {
    value >>= 1n;
    index += 1;
  }
  return index;
}

function popcount(mask: bigint): number {
  let count = 0;
  let value = mask;
  while (value !== 0n) {
    value &= value - 1n;
    count += 1;
  }
  return count;
}

function fullMask(cellCount: number): bigint {
  return (1n << BigInt(cellCount)) - 1n;
}

function bitFor(index: number): bigint {
  return 1n << BigInt(index);
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

function adjacentIndices(
  index: number,
  width: number,
  height: number,
): readonly number[] {
  const row = Math.floor(index / width);
  const column = index % width;
  return [
    row > 0 ? index - width : -1,
    column > 0 ? index - 1 : -1,
    column + 1 < width ? index + 1 : -1,
    row + 1 < height ? index + width : -1,
  ].filter((candidate) => candidate >= 0);
}

function directionBetween(
  first: number,
  second: number,
  width: number,
): number {
  if (second === first - width) {
    return 0;
  }
  if (second === first + 1) {
    return 1;
  }
  if (second === first + width) {
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
