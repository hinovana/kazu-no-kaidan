export interface SeededRandom {
  readonly next: () => number;
  readonly integer: (minimum: number, maximumInclusive: number) => number;
  readonly shuffle: <T>(values: readonly T[]) => T[];
}

export function createSeededRandom(seed: string): SeededRandom {
  let state = hashStringToUint32(seed);
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  return {
    next,
    integer(minimum, maximumInclusive) {
      if (!Number.isInteger(minimum) || !Number.isInteger(maximumInclusive) || maximumInclusive < minimum) {
        throw new RangeError("invalid integer range");
      }
      return minimum + Math.floor(next() * (maximumInclusive - minimum + 1));
    },
    shuffle<T>(values: readonly T[]): T[] {
      const result = [...values];
      for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(next() * (index + 1));
        const temporary = result[index];
        const replacement = result[swapIndex];
        if (temporary !== undefined && replacement !== undefined) {
          result[index] = replacement;
          result[swapIndex] = temporary;
        }
      }
      return result;
    },
  };
}

export function stableHash(value: string): string {
  return hashStringToUint32(value).toString(16).padStart(8, "0");
}

function hashStringToUint32(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
