/**
 * 経路探索途中の残余盤面をBigInt bitsetで表し、到達可能性を判定する。
 *
 * solverとoptimizerが共有する枝刈り用の低水準処理をまとめる。
 *
 * @packageDocumentation
 */

/**
 * 経路探索途中の残余盤面。
 *
 * `occupied`のセルと、探索target以外の端点セルは通過不能として扱う。
 */
export interface ResidualGrid {
  readonly width: number;
  readonly height: number;
  readonly occupied: bigint;
  readonly terminalIndices: ReadonlySet<number>;
}

/** 残余盤面上でstartからtargetへ到達できるかを判定する。 */
export function isReachable(
  grid: ResidualGrid,
  startIndex: number,
  targetIndex: number,
): boolean {
  return shortestPathDistance(grid, startIndex, targetIndex) !== null;
}

/**
 * 残余盤面上の上下左右の最短辺数を返す。
 *
 * target以外の端点を中継せず、到達不能なら`null`を返す。
 */
export function shortestPathDistance(
  grid: ResidualGrid,
  startIndex: number,
  targetIndex: number,
): number | null {
  if (startIndex === targetIndex) {
    return 0;
  }
  const cellCount = grid.width * grid.height;
  const queue = new Int16Array(cellCount);
  const seen = new Uint8Array(cellCount);
  const distance = new Int16Array(cellCount);
  distance.fill(-1);
  queue[0] = startIndex;
  seen[startIndex] = 1;
  distance[startIndex] = 0;
  let queueLength = 1;

  for (let cursor = 0; cursor < queueLength; cursor += 1) {
    const current = queue[cursor] ?? 0;
    const row = Math.floor(current / grid.width);
    const column = current % grid.width;
    const neighbors = [
      row > 0 ? current - grid.width : -1,
      column + 1 < grid.width ? current + 1 : -1,
      row + 1 < grid.height ? current + grid.width : -1,
      column > 0 ? current - 1 : -1,
    ];
    for (const next of neighbors) {
      if (next < 0 || seen[next] === 1 || isBitSet(grid.occupied, next)) {
        continue;
      }
      if (grid.terminalIndices.has(next) && next !== targetIndex) {
        continue;
      }
      if (next === targetIndex) {
        return (distance[current] ?? 0) + 1;
      }
      seen[next] = 1;
      distance[next] = (distance[current] ?? 0) + 1;
      queue[queueLength] = next;
      queueLength += 1;
    }
  }
  return null;
}

/** `bigint` bitmaskの指定indexが1かを判定する。 */
export function isBitSet(bits: bigint, index: number): boolean {
  return (bits & (1n << BigInt(index))) !== 0n;
}

/** `bigint` bitmaskの指定indexを1にした値を返す。 */
export function setBit(bits: bigint, index: number): bigint {
  return bits | (1n << BigInt(index));
}
