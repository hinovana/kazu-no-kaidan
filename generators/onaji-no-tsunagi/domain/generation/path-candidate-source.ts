/**
 * profileの盤面寸法と曲がり上限から、単純経路候補を遅延列挙・再利用する。
 *
 * 5×5はv3.3互換の全長一括列挙、6×6は必要な経路長だけの遅延列挙を使う。
 * 経路の向きを正規化して重複を除き、1マス幅のU字を候補に含めない。
 *
 * @packageDocumentation
 */

import type { UniquePathCoverProfile } from "./unique-path-cover-profile.ts";
import {
  adjacentPathCellIndices,
  bitForPathCell,
  directionBetweenPathCells,
} from "./path-cover-grid.ts";

/** exact-cover探索へ渡す、占有mask付きの単純経路候補。 @internal */
export interface PathCandidate {
  readonly cells: readonly number[];
  readonly occupiedMask: bigint;
}

/**
 * 残余maskへ収まる候補を、同じ条件では同じ順序で返す経路候補source。
 *
 * @internal
 */
export interface PathCandidateSource {
  /** 指定長かつ未使用マス内だけで構成できる候補を列挙順どおりに返す。 */
  candidatesFor(
    length: number,
    remainingMask: bigint,
  ): readonly PathCandidate[];
}

const candidateSourceByGeometry = new Map<string, PathCandidateSource>();

/**
 * profileのgeometryを共有する、遅延評価済み候補sourceを返す。
 *
 * @internal
 */
export function getPathCandidateSource(
  profile: UniquePathCoverProfile,
): PathCandidateSource {
  const geometryKey = [
    profile.width,
    profile.height,
    profile.maximumPathTurnCount,
  ].join("x");
  const cachedSource = candidateSourceByGeometry.get(geometryKey);
  if (cachedSource !== undefined) {
    return cachedSource;
  }
  const source = createLazyPathCandidateSource(
    profile.width,
    profile.height,
    profile.maximumPathTurnCount,
  );
  candidateSourceByGeometry.set(geometryKey, source);
  return source;
}

function createLazyPathCandidateSource(
  width: number,
  height: number,
  maximumTurnCount: number,
): PathCandidateSource {
  if (width === 5 && height === 5) {
    return createFiveByFiveCandidateSource(
      width,
      height,
      maximumTurnCount,
    );
  }
  return createCandidatesByRequestedLengthSource(
    width,
    height,
    maximumTurnCount,
  );
}

function createFiveByFiveCandidateSource(
  width: number,
  height: number,
  maximumTurnCount: number,
): PathCandidateSource {
  let candidatesByLength:
    | ReadonlyMap<number, readonly PathCandidate[]>
    | undefined;
  return {
    candidatesFor(length, remainingMask) {
      candidatesByLength ??= enumerateLowTurnPathsByLength(
        width,
        height,
        14,
        maximumTurnCount,
      );
      return candidatesContainedInMask(
        candidatesByLength.get(length) ?? [],
        remainingMask,
      );
    },
  };
}

function createCandidatesByRequestedLengthSource(
  width: number,
  height: number,
  maximumTurnCount: number,
): PathCandidateSource {
  const candidatesByLength = new Map<
    number,
    readonly PathCandidate[]
  >();
  return {
    candidatesFor(length, remainingMask) {
      let candidates = candidatesByLength.get(length);
      if (candidates === undefined) {
        candidates = enumerateLowTurnPathsOfLength(
          width,
          height,
          length,
          maximumTurnCount,
        );
        candidatesByLength.set(length, candidates);
      }
      return candidatesContainedInMask(candidates, remainingMask);
    },
  };
}

function candidatesContainedInMask(
  candidates: readonly PathCandidate[],
  remainingMask: bigint,
): readonly PathCandidate[] {
  return candidates.filter((candidate) => (
    (candidate.occupiedMask & remainingMask) === candidate.occupiedMask
  ));
}

function enumerateLowTurnPathsByLength(
  width: number,
  height: number,
  maximumEdgeCount: number,
  maximumTurnCount: number,
): ReadonlyMap<number, readonly PathCandidate[]> {
  const cellCount = width * height;
  const candidateBySignature = new Map<string, PathCandidate>();
  for (let start = 0; start < cellCount; start += 1) {
    visit([start], 0n, -1, 0);
  }
  const candidatesByLength = new Map<number, PathCandidate[]>();
  for (const candidate of candidateBySignature.values()) {
    if (candidate.cells.length < 3) {
      continue;
    }
    const candidates = candidatesByLength.get(candidate.cells.length) ?? [];
    candidates.push(candidate);
    candidatesByLength.set(candidate.cells.length, candidates);
  }
  return candidatesByLength;

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
    const nextMask = occupiedMask | bitForPathCell(current);
    if (cells.length >= 2) {
      candidateBySignature.set(
        canonicalPathSignature(cells),
        { cells: [...cells], occupiedMask: nextMask },
      );
    }
    if (cells.length - 1 >= maximumEdgeCount) {
      return;
    }
    for (const nextStep of availableNextPathSteps(
      current,
      nextMask,
      previousDirection,
      turnCount,
      width,
      height,
      maximumTurnCount,
    )) {
      visit(
        [...cells, nextStep.cellIndex],
        nextMask,
        nextStep.direction,
        nextStep.turnCount,
      );
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
  const candidateBySignature = new Map<string, PathCandidate>();
  for (let start = 0; start < cellCount; start += 1) {
    visit([start], 0n, -1, 0);
  }
  return [...candidateBySignature.values()];

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
    const nextMask = occupiedMask | bitForPathCell(current);
    if (cells.length === targetLength) {
      if (!hasUnitBay(cells, width)) {
        candidateBySignature.set(
          canonicalPathSignature(cells),
          { cells: [...cells], occupiedMask: nextMask },
        );
      }
      return;
    }
    for (const nextStep of availableNextPathSteps(
      current,
      nextMask,
      previousDirection,
      turnCount,
      width,
      height,
      maximumTurnCount,
    )) {
      visit(
        [...cells, nextStep.cellIndex],
        nextMask,
        nextStep.direction,
        nextStep.turnCount,
      );
    }
  }
}

function canonicalPathSignature(cells: readonly number[]): string {
  const forward = cells.join(".");
  const reverse = [...cells].reverse().join(".");
  return forward.localeCompare(reverse) <= 0 ? forward : reverse;
}

function countTurn(
  previousDirection: number,
  direction: number,
  turnCount: number,
): number {
  return previousDirection >= 0 && direction !== previousDirection
    ? turnCount + 1
    : turnCount;
}

interface NextPathStep {
  readonly cellIndex: number;
  readonly direction: number;
  readonly turnCount: number;
}

function availableNextPathSteps(
  current: number,
  occupiedMask: bigint,
  previousDirection: number,
  turnCount: number,
  width: number,
  height: number,
  maximumTurnCount: number,
): readonly NextPathStep[] {
  const steps: NextPathStep[] = [];
  for (const cellIndex of adjacentPathCellIndices(current, width, height)) {
    if ((occupiedMask & bitForPathCell(cellIndex)) !== 0n) {
      continue;
    }
    const direction = directionBetweenPathCells(current, cellIndex, width);
    const nextTurnCount = countTurn(
      previousDirection,
      direction,
      turnCount,
    );
    if (nextTurnCount <= maximumTurnCount) {
      steps.push({ cellIndex, direction, turnCount: nextTurnCount });
    }
  }
  return steps;
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
