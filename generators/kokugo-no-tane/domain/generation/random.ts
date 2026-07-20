export interface RandomSource {
  next(): number;
}

export function hash32(value: unknown): number {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createRandom(seed: unknown): RandomSource {
  let state = hash32(seed) || 0x9e3779b9;
  return {
    next() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function createRandomFunction(seed: unknown): () => number {
  const source = createRandom(seed);
  return () => source.next();
}
