/**
 * solution-first経路探索専用の盤面bitmaskと隣接順を提供する。
 *
 * 汎用grid helperとは探索順が異なるため、生成済みseedの再現性を守る目的で
 * この境界に順序を明示している。
 *
 * @packageDocumentation
 */

/**
 * 指定マスだけを立てたBigInt bitmaskを返す。
 *
 * @internal
 */
export function bitForPathCell(index: number): bigint {
  return 1n << BigInt(index);
}

/**
 * 盤面の全マスを立てたBigInt bitmaskを返す。
 *
 * @internal
 */
export function fullPathCoverMask(cellCount: number): bigint {
  return (1n << BigInt(cellCount)) - 1n;
}

/**
 * mask中で最小indexの立っているbitを返す。
 *
 * @remarks `mask`が0でないことを事前条件とする。
 * @internal
 */
export function firstPathCellInMask(mask: bigint): number {
  let index = 0;
  let value = mask;
  while ((value & 1n) === 0n) {
    value >>= 1n;
    index += 1;
  }
  return index;
}

/**
 * mask中の立っているbit数を返す。
 *
 * @internal
 */
export function countPathCells(mask: bigint): number {
  let count = 0;
  let value = mask;
  while (value !== 0n) {
    value &= value - 1n;
    count += 1;
  }
  return count;
}

/**
 * row-major indexに隣接するindexを上、左、右、下の順で返す。
 *
 * @remarks
 * この順序はv3.3からの経路候補列挙順であり、seed再現性の一部である。
 *
 * @internal
 */
export function adjacentPathCellIndices(
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
  ].filter(candidate => candidate >= 0);
}

/**
 * 隣接二マス間の方向を上、右、下、左の0〜3へ変換する。
 *
 * @internal
 */
export function directionBetweenPathCells(
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
