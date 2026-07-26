/**
 * seedから再現可能な疑似乱数と安定hashを提供する。
 *
 * 作問の決定性を支える内部基盤であり、暗号用途は対象にしない。
 *
 * @packageDocumentation
 */

/**
 * seedから同じ列を再現できる疑似乱数source。
 *
 * 暗号用途には使用しない。`shuffle`は入力を変更せず新しい配列を返す。
 */
export interface SeededRandom {
  /** 0以上1未満の次の疑似乱数を返す。 */
  readonly next: () => number;
  /** 両端を含む整数範囲から一つ返す。 */
  readonly integer: (minimum: number, maximumInclusive: number) => number;
  /** 入力配列を変更せず、決定的に並べ替えたcopyを返す。 */
  readonly shuffle: <T>(values: readonly T[]) => T[];
}

/**
 * 文字列seedから決定的な疑似乱数sourceを作る。
 *
 * `integer`の上限はinclusiveであり、範囲が整数でない場合は`RangeError`を
 * throwする。
 */
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
      if (
        !Number.isInteger(minimum) ||
        !Number.isInteger(maximumInclusive) ||
        maximumInclusive < minimum
      ) {
        throw new RangeError('invalid integer range');
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

/**
 * 再現性識別子に使う固定8桁の16進hashを返す。
 *
 * 衝突耐性や改ざん検知を目的とした暗号学的hashではない。
 */
export function stableHash(value: string): string {
  return hashStringToUint32(value).toString(16).padStart(8, '0');
}

function hashStringToUint32(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
