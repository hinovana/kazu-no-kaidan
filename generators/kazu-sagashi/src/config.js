export const GENERATOR_VERSION = "kazu-sagashi-v5";

const SEARCH_LIMITS = Object.freeze({
  maxRestarts: 64,
  maxRepairStepsPerRestart: 512,
  tabuLength: 16,
  stagnationLimit: 32,
  maxVariantIndex: 31,
});

export const LEVEL_PROFILES = Object.freeze({
  1: Object.freeze({
    level: 1,
    rows: 6,
    cols: 6,
    maxPerCell: 1,
    mode: "single-exact",
    cellValues: Object.freeze([0, 1]),
    targets: Object.freeze([2, 3]),
    requiredNearMissCount: 2,
    requiredAdjacentNearMissCount: 0,
    initialProbabilities: Object.freeze([0.5, 0.5]),
    ...SEARCH_LIMITS,
  }),
  2: Object.freeze({
    level: 2,
    rows: 8,
    cols: 8,
    maxPerCell: 1,
    mode: "single-exact",
    cellValues: Object.freeze([0, 1]),
    targets: Object.freeze([2, 3, 4, 5]),
    requiredNearMissCount: 5,
    requiredAdjacentNearMissCount: 1,
    initialProbabilities: Object.freeze([0.5, 0.5]),
    ...SEARCH_LIMITS,
  }),
  3: Object.freeze({
    level: 3,
    rows: 10,
    cols: 10,
    maxPerCell: 1,
    mode: "single-exact",
    cellValues: Object.freeze([0, 1]),
    targets: Object.freeze([3, 4, 5, 6, 7, 8]),
    requiredNearMissCount: 8,
    requiredAdjacentNearMissCount: 1,
    initialProbabilities: Object.freeze([0.5, 0.5]),
    ...SEARCH_LIMITS,
  }),
  4: Object.freeze({
    level: 4,
    rows: 9,
    cols: 9,
    maxPerCell: 2,
    mode: "stacked-single-exact",
    cellValues: Object.freeze([0, 1, 2]),
    targets: Object.freeze([4, 5, 6, 7]),
    requiredNearMissCount: 4,
    requiredAdjacentNearMissCount: 1,
    initialProbabilities: Object.freeze([0.4, 0.4, 0.2]),
    ...SEARCH_LIMITS,
  }),
  5: Object.freeze({
    level: 5,
    rows: 8,
    cols: 8,
    maxPerCell: 1,
    mode: "pair-exact",
    cellValues: Object.freeze([0, 1, 2]),
    cellStates: Object.freeze(["empty", "apple", "pear"]),
    targetPairs: Object.freeze(
      Array.from({ length: 18 }, (_, index) => {
        let offset = index;
        for (let total = 4; total <= 7; total += 1) {
          const count = total - 1;
          if (offset < count) return Object.freeze({ targetApple: offset + 1, targetPear: total - offset - 1 });
          offset -= count;
        }
        throw new RangeError("レベル5の目標ペア定義が不正です");
      })
    ),
    requiredNearMissCount: 5,
    requiredAdjacentNearMissCount: 1,
    initialProbabilities: Object.freeze([0.4, 0.3, 0.3]),
    ...SEARCH_LIMITS,
  }),
  6: Object.freeze({
    level: 6,
    rows: 8,
    cols: 8,
    maxPerCell: 1,
    mode: "pair-relation",
    cellValues: Object.freeze([0, 1, 2]),
    cellStates: Object.freeze(["empty", "apple", "pear"]),
    relations: Object.freeze(["equal", "apple-less"]),
    requiredNearMissCount: 6,
    requiredAdjacentNearMissCount: 1,
    initialProbabilities: Object.freeze([0.4, 0.3, 0.3]),
    ...SEARCH_LIMITS,
  }),
  7: Object.freeze({
    level: 7,
    levelLabel: "ノイマン",
    rows: 10,
    cols: 10,
    maxPerCell: 1,
    mode: "triple-order",
    cellValues: Object.freeze([0, 1, 2, 3]),
    cellStates: Object.freeze(["empty", "apple", "pear", "orange"]),
    answerTriples: Object.freeze([
      Object.freeze([1, 2, 3]),
      Object.freeze([1, 2, 4]),
      Object.freeze([1, 3, 4]),
    ]),
    requiredPartialCandidateCount: 8,
    requiredDistractorCount: 3,
    requiredSameCount: 5,
    requiredJointCueCount: 3,
    requiredVisualExpectedRank: 3,
    requiredDistractorRegions: 3,
    initialProbabilities: Object.freeze([0.4, 0.2, 0.2, 0.2]),
    maxRestarts: 128,
    maxRepairStepsPerRestart: 1024,
    maxQualityMovesPerStep: 96,
    tabuLength: 24,
    stagnationLimit: 64,
    maxVariantIndex: 31,
  }),
});

export function levelProfile(level) {
  const profile = LEVEL_PROFILES[level];
  if (!profile) {
    throw new RangeError(`未対応のレベルです: ${level}`);
  }
  return profile;
}
