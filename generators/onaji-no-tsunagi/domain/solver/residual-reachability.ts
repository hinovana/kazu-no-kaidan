export interface ResidualGrid {
  readonly width: number;
  readonly height: number;
  readonly occupied: bigint;
  readonly terminalIndices: ReadonlySet<number>;
}

export function isReachable(
  grid: ResidualGrid,
  startIndex: number,
  targetIndex: number,
): boolean {
  return shortestPathDistance(grid, startIndex, targetIndex) !== null;
}

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

export function isBitSet(bits: bigint, index: number): boolean {
  return (bits & (1n << BigInt(index))) !== 0n;
}

export function setBit(bits: bigint, index: number): bigint {
  return bits | (1n << BigInt(index));
}
