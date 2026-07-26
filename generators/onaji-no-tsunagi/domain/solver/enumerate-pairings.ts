/**
 * 同じ記号を持つ端点について、partner候補と完全matchingを列挙する。
 *
 * 記号が4個以上ある問題では、どの2個を組にするかも探索対象として扱う。
 *
 * @packageDocumentation
 */

import {manhattanDistance} from '../grid/coordinates.ts';
import type {Terminal} from '../types/puzzle.ts';

/**
 * 指定端点と同じ記号の未指定partner候補を決定的な順序で返す。
 *
 * 近い端点を先にし、同距離では`terminalId`で整列する。この順序は探索効率と
 * 再現性のためのheuristicであり、正解pairを固定するものではない。
 */
export function listSameSymbolPartners(
  terminal: Terminal,
  terminals: readonly Terminal[],
): readonly Terminal[] {
  return terminals
    .filter(
      candidate =>
        candidate.symbol === terminal.symbol &&
        candidate.terminalId !== terminal.terminalId,
    )
    .toSorted(
      (left, right) =>
        manhattanDistance(terminal, left) -
          manhattanDistance(terminal, right) ||
        left.terminalId.localeCompare(right.terminalId),
    );
}

/**
 * 同じ記号の`terminalCount`個を二個ずつ組にする完全matching数を返す。
 *
 * 2未満または奇数の場合は有効な完全matchingがないため0を返す。
 */
export function countPerfectMatchings(terminalCount: number): number {
  if (terminalCount < 2 || terminalCount % 2 !== 0) {
    return 0;
  }
  let result = 1;
  for (let value = terminalCount - 1; value >= 1; value -= 2) {
    result *= value;
  }
  return result;
}

/** 二つのterminal IDをlocale順の安定したpairへ正規化する。 */
export function orderedTerminalIds(
  first: string,
  second: string,
): readonly [string, string] {
  return first.localeCompare(second) <= 0 ? [first, second] : [second, first];
}

/** 向きを区別しないterminal pairのMap・Set用keyを作る。 */
export function terminalPairKey(first: string, second: string): string {
  return orderedTerminalIds(first, second).join('|');
}
