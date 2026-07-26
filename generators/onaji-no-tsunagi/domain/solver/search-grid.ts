/**
 * solverとoptimizerが共有する盤面探索状態、端点順序、枝刈り判定を提供する。
 *
 * @packageDocumentation
 */

import { adjacentIndices } from "../grid/adjacency.ts";
import { cellIndex } from "../grid/coordinates.ts";
import type { Puzzle, Terminal } from "../types/puzzle.ts";
import {
  isBitSet,
  isReachable,
} from "./residual-reachability.ts";

/** Puzzleの全端点セルをrow-major indexのSetへ変換する。 */
export function createTerminalIndexSet(
  puzzle: Puzzle,
): ReadonlySet<number> {
  return new Set(
    puzzle.terminals.map((terminal) => (
      cellIndex(terminal, puzzle.width)
    )),
  );
}

/**
 * 端点をrow-major index、同一セルでは`terminalId`の順に整列する。
 *
 * solverとoptimizerで同じ決定的探索順を共有するために使う。
 */
export function sortTerminals(
  terminals: readonly Terminal[],
  width: number,
): readonly Terminal[] {
  return terminals.toSorted((left, right) => (
    cellIndex(left, width) - cellIndex(right, width)
    || left.terminalId.localeCompare(right.terminalId)
  ));
}

/**
 * 占有maskと残存terminal集合から、失敗memo用の決定的な状態keyを作る。
 */
export function terminalSearchStateKey(
  occupied: bigint,
  remainingTerminals: readonly Terminal[],
): string {
  return `${occupied.toString(16)}|${remainingTerminals
    .map((terminal) => terminal.terminalId)
    .toSorted()
    .join(",")}`;
}

/**
 * 経路探索で候補セルへ進入できるかを判定する。
 *
 * 使用済み・現在経路で訪問済みのセルと、target以外の端点セルを拒否する。
 */
export function canEnterPathCell(
  terminalIndices: ReadonlySet<number>,
  index: number,
  targetIndex: number,
  occupied: bigint,
  visited: bigint,
): boolean {
  if (isBitSet(occupied, index) || isBitSet(visited, index)) {
    return false;
  }
  return index === targetIndex || !terminalIndices.has(index);
}

/**
 * 各残余連結成分で、記号ごとの未接続端点数が偶数かを判定する。
 *
 * @remarks
 * 解が存在するための必要条件であり、十分条件ではない。有効解を除外しない
 * soundな枝刈りとしてsolverとoptimizerで共有する。
 */
export function hasEvenSymbolParityInEveryComponent(
  puzzle: Puzzle,
  terminals: readonly Terminal[],
  occupied: bigint,
): boolean {
  const componentByIndex = new Int16Array(
    puzzle.width * puzzle.height,
  );
  componentByIndex.fill(-1);
  let component = 0;
  for (let index = 0; index < componentByIndex.length; index += 1) {
    if (componentByIndex[index] !== -1 || isBitSet(occupied, index)) {
      continue;
    }
    const queue = [index];
    componentByIndex[index] = component;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current === undefined) {
        continue;
      }
      for (const neighbor of adjacentIndices(
        current,
        puzzle.width,
        puzzle.height,
      )) {
        if (
          componentByIndex[neighbor] === -1
          && !isBitSet(occupied, neighbor)
        ) {
          componentByIndex[neighbor] = component;
          queue.push(neighbor);
        }
      }
    }
    component += 1;
  }
  const counts = new Map<string, number>();
  for (const terminal of terminals) {
    const componentId = componentByIndex[cellIndex(
      terminal,
      puzzle.width,
    )];
    const key = `${componentId}:${terminal.symbol}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].every((count) => count % 2 === 0);
}

/**
 * 各未接続端点に、残余盤面上で到達可能な同記号partnerがあるかを判定する。
 *
 * @remarks
 * `requiredPartnerByTerminalId`がある端点は指定partnerだけを調べる。これは
 * 各端点単独の必要条件であり、全pairを同時に結べる十分条件ではない。
 */
export function allTerminalsHaveReachablePartners(
  puzzle: Puzzle,
  terminalIndices: ReadonlySet<number>,
  terminals: readonly Terminal[],
  occupied: bigint,
  requiredPartnerByTerminalId?: ReadonlyMap<string, string>,
): boolean {
  const grid = {
    width: puzzle.width,
    height: puzzle.height,
    occupied,
    terminalIndices,
  };
  return terminals.every((terminal) => {
    const requiredPartnerId = requiredPartnerByTerminalId?.get(
      terminal.terminalId,
    );
    return terminals.some((candidate) => (
      candidate.terminalId !== terminal.terminalId
      && candidate.symbol === terminal.symbol
      && (
        requiredPartnerId === undefined
        || candidate.terminalId === requiredPartnerId
      )
      && isReachable(
        grid,
        cellIndex(terminal, puzzle.width),
        cellIndex(candidate, puzzle.width),
      )
    ));
  });
}
