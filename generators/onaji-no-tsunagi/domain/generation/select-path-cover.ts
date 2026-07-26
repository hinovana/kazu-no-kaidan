/**
 * 指定された経路長の候補から、盤面をちょうど一度ずつ覆う組を探索する。
 *
 * 候補の生成方法からexact-cover探索を分離し、探索予算超過と構成不能を
 * 明確に区別して呼び出し元へ返す。
 *
 * @packageDocumentation
 */

import type {SeededRandom} from './random.ts';
import type {
  PathCandidate,
  PathCandidateSource,
} from './path-candidate-source.ts';
import type {UniquePathCoverProfile} from './unique-path-cover-profile.ts';
import {
  adjacentPathCellIndices,
  bitForPathCell,
  countPathCells,
  firstPathCellInMask,
  fullPathCoverMask,
} from './path-cover-grid.ts';

/** exact-cover探索の成功、構成不能、予算超過を区別する結果。 @internal */
export type PathCoverResult =
  | {
      readonly status: 'built';
      readonly paths: readonly PathCandidate[];
      readonly constructionStateCount: number;
    }
  | {
      readonly status: 'not_constructed';
      readonly constructionStateCount: number;
    }
  | {
      readonly status: 'budget_exhausted';
      readonly constructionStateCount: number;
    };

/**
 * 経路長列を満たす、互いに交差しない盤面全体のexact coverを一つ選ぶ。
 *
 * @internal
 */
export function selectPathCover(
  lengths: readonly number[],
  random: SeededRandom,
  profile: UniquePathCoverProfile,
  source: PathCandidateSource,
): PathCoverResult {
  const fullBoardMask = fullPathCoverMask(profile.width * profile.height);
  const firstLength = lengths[0];
  if (firstLength === undefined) {
    return notConstructed(0);
  }
  const firstPath = selectRandom(
    source.candidatesFor(firstLength, fullBoardMask),
    random,
  );
  if (firstPath === undefined) {
    return notConstructed(0);
  }

  const selectedPaths: PathCandidate[] = [firstPath];
  let constructionStateCount = 0;
  let budgetExhausted = false;
  const found = search(
    lengths.slice(1),
    fullBoardMask & ~firstPath.occupiedMask,
  );
  if (found) {
    return {
      status: 'built',
      paths: selectedPaths,
      constructionStateCount,
    };
  }
  return {
    status: budgetExhausted ? 'budget_exhausted' : 'not_constructed',
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
    if (!canFillRemainingCells(remainingMask, remainingLengths, profile)) {
      return false;
    }

    const selectedOption = chooseNextLength(
      remainingLengths,
      remainingMask,
      source,
      profile.width === 5,
    );
    if (
      selectedOption === undefined ||
      selectedOption.candidates.length === 0
    ) {
      return false;
    }
    const nextLengths = remainingLengths.toSpliced(selectedOption.index, 1);
    if (nextLengths.length === 0) {
      const exactCandidates = selectedOption.candidates.filter(
        candidate => candidate.occupiedMask === remainingMask,
      );
      const lastPath = selectRandom(exactCandidates, random);
      if (lastPath === undefined) {
        return false;
      }
      selectedPaths.push(lastPath);
      return true;
    }

    for (const candidate of random.shuffle(selectedOption.candidates)) {
      constructionStateCount += 1;
      if (constructionStateCount > profile.maximumConstructionStates) {
        budgetExhausted = true;
        return false;
      }
      selectedPaths.push(candidate);
      if (search(nextLengths, remainingMask & ~candidate.occupiedMask)) {
        return true;
      }
      selectedPaths.pop();
      if (budgetExhausted) {
        return false;
      }
    }
    return false;
  }
}

interface LengthOption {
  readonly length: number;
  readonly index: number;
  readonly candidates: readonly PathCandidate[];
}

function chooseNextLength(
  remainingLengths: readonly number[],
  remainingMask: bigint,
  source: PathCandidateSource,
  preserveLegacyOrder: boolean,
): LengthOption | undefined {
  const options = remainingLengths.map((length, index) => ({
    length,
    index,
    candidates: source.candidatesFor(length, remainingMask),
  }));
  if (preserveLegacyOrder) {
    return options[0];
  }
  return options.toSorted(
    (left, right) =>
      left.candidates.length - right.candidates.length ||
      left.index - right.index,
  )[0];
}

function canFillRemainingCells(
  remainingMask: bigint,
  remainingLengths: readonly number[],
  profile: UniquePathCoverProfile,
): boolean {
  const requiredCellCount = remainingLengths.reduce(
    (sum, length) => sum + length,
    0,
  );
  if (countPathCells(remainingMask) !== requiredCellCount) {
    return false;
  }
  return (
    profile.width === 5 ||
    componentsCanStillBeCovered(
      remainingMask,
      remainingLengths,
      profile.width,
      profile.height,
    )
  );
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
    const start = firstPathCellInMask(unvisited);
    const queue = [start];
    unvisited &= ~bitForPathCell(start);
    let size = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current === undefined) {
        continue;
      }
      size += 1;
      for (const next of adjacentPathCellIndices(current, width, height)) {
        const nextBit = bitForPathCell(next);
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
  return componentSizes.every(size => size >= minimumLength);
}

function selectRandom<T>(
  values: readonly T[],
  random: SeededRandom,
): T | undefined {
  return values.length === 0
    ? undefined
    : values[random.integer(0, values.length - 1)];
}

function notConstructed(constructionStateCount: number): PathCoverResult {
  return {status: 'not_constructed', constructionStateCount};
}
