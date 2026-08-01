/**
 * exact-coverで選ばれた経路へ、三種類の記号を決定的に割り当てる。
 *
 * 5×5の乱数消費順はv3.3互換を維持し、6×6は同じ経路geometryに対する
 * 異なる記号割当を重複なく列挙する。
 *
 * @packageDocumentation
 */

import type {SymbolId} from '../types/puzzle.ts';
import {createSeededRandom, type SeededRandom} from './random.ts';

type SymbolPathCounts = readonly [number, number, number];

const SYMBOLS: readonly SymbolId[] = ['circle', 'square', 'triangle'];
const assignmentsByPathCounts = new Map<
  string,
  readonly (readonly number[])[]
>();

/**
 * 同じ経路本数を持つ記号を区別しない、異なる記号割当の総数を返す。
 *
 * @internal
 */
export function countPathSymbolAssignments(
  pathCounts: SymbolPathCounts,
): number {
  return enumerateSymbolAssignments(pathCounts).length;
}

/**
 * 5×5の既存乱数消費順を保って、各経路へ記号を割り当てる。
 *
 * @internal
 */
export function assignFiveByFivePathSymbols(
  random: SeededRandom,
  pathCounts: SymbolPathCounts,
): readonly SymbolId[] {
  return random.shuffle(
    random
      .shuffle(SYMBOLS)
      .flatMap((symbol, symbolIndex) =>
        Array.from({length: pathCounts[symbolIndex] ?? 0}, () => symbol),
      ),
  );
}

/**
 * route seedが定める巡回順から、指定variantの6×6記号割当を返す。
 *
 * @internal
 */
export function assignSixBySixPathSymbols(
  routeSeed: string,
  pathCounts: SymbolPathCounts,
  variant: number,
): readonly SymbolId[] {
  const assignments = enumerateSixBySixPathSymbols(routeSeed, pathCounts);
  return assignments[variant % assignments.length] ?? [];
}

/**
 * route seedが定める巡回順で、6×6の異なる記号割当をすべて返す。
 *
 * @remarks
 * 同じ経路本数を持つ記号名の入れ替えは同一assignmentとして列挙し、
 * 記号名自体の対応はroute seedから決定する。
 *
 * @internal
 */
export function enumerateSixBySixPathSymbols(
  routeSeed: string,
  pathCounts: SymbolPathCounts,
): readonly (readonly SymbolId[])[] {
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
  const symbolOrder = createSeededRandom(`${routeSeed}::symbol-labels`).shuffle(
    SYMBOLS,
  );
  return assignments.map((_, variant) => {
    const assignment =
      assignments[(offset + variant * step) % assignments.length] ?? [];
    return assignment.map(groupIndex => symbolOrder[groupIndex] ?? 'circle');
  });
}

function enumerateSymbolAssignments(
  pathCounts: SymbolPathCounts,
): readonly (readonly number[])[] {
  const cacheKey = pathCounts.join('-');
  const cachedAssignments = assignmentsByPathCounts.get(cacheKey);
  if (cachedAssignments !== undefined) {
    return cachedAssignments;
  }

  const pathCount = pathCounts.reduce((sum, count) => sum + count, 0);
  const pathIndices = [...Array.from({length: pathCount}).keys()];
  const assignments: number[][] = [];
  assignGroup(0, pathIndices, []);
  assignmentsByPathCounts.set(cacheKey, assignments);
  return assignments;

  function assignGroup(
    groupIndex: number,
    remainingIndices: readonly number[],
    groups: readonly (readonly number[])[],
  ): void {
    const groupSize = pathCounts[groupIndex];
    if (groupSize === undefined) {
      assignments.push(createAssignment(pathCount, groups));
      return;
    }
    for (const selectedIndices of combinations(remainingIndices, groupSize)) {
      const previousGroup = groups[groupIndex - 1];
      const previousGroupHasSameSize = pathCounts[groupIndex - 1] === groupSize;
      if (
        previousGroup !== undefined &&
        previousGroupHasSameSize &&
        compareNumberArrays(previousGroup, selectedIndices) >= 0
      ) {
        continue;
      }
      const selectedIndexSet = new Set(selectedIndices);
      assignGroup(
        groupIndex + 1,
        remainingIndices.filter(index => !selectedIndexSet.has(index)),
        [...groups, selectedIndices],
      );
    }
  }
}

function createAssignment(
  pathCount: number,
  groups: readonly (readonly number[])[],
): number[] {
  const assignment = Array.from({length: pathCount}, () => -1);
  groups.forEach((indices, groupIndex) => {
    for (const pathIndex of indices) {
      assignment[pathIndex] = groupIndex;
    }
  });
  return assignment;
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
    for (let index = start; index <= values.length - needed; index += 1) {
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
