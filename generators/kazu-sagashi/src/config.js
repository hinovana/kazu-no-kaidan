export const GENERATOR_VERSION = "kazu-sagashi-v6";

const SEARCH_LIMITS = Object.freeze({
  maxRestarts: 64,
  maxRepairStepsPerRestart: 512,
  tabuLength: 16,
  stagnationLimit: 32,
  maxVariantIndex: 31,
});

const LEVEL_1_PROFILE = Object.freeze({
  level: 1,
  profileKey: "1",
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
});

export const LEVEL_2_VARIANTS = Object.freeze([
  Object.freeze({
    level: 2,
    levelVariant: "2A",
    levelVariantLabel: "リンゴ1種類",
    profileKey: "2A",
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
  Object.freeze({
    level: 2,
    levelVariant: "2B",
    levelVariantLabel: "1マス2個まで",
    profileKey: "2B",
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
  Object.freeze({
    level: 2,
    levelVariant: "2C",
    levelVariantLabel: "リンゴとナシの個数",
    profileKey: "2C",
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
        throw new RangeError("レベル2Cの目標ペア定義が不正です");
      })
    ),
    requiredNearMissCount: 5,
    requiredAdjacentNearMissCount: 1,
    initialProbabilities: Object.freeze([0.4, 0.3, 0.3]),
    ...SEARCH_LIMITS,
  }),
]);

const LEVEL_3_PROFILE = Object.freeze({
  level: 3,
  profileKey: "3",
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
});

const NEUMANN_PROFILE = Object.freeze({
  level: 7,
  levelLabel: "ノイマン",
  profileKey: "N",
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
});

export const LEVEL_PROFILES = Object.freeze({
  1: LEVEL_1_PROFILE,
  2: Object.freeze({
    level: 2,
    mode: "mixed",
    variants: LEVEL_2_VARIANTS,
    maxVariantIndex: SEARCH_LIMITS.maxVariantIndex,
  }),
  3: LEVEL_3_PROFILE,
  7: NEUMANN_PROFILE,
});

export const SUPPORTED_LEVELS = Object.freeze([1, 2, 3, 7]);

export function levelProfile(level) {
  const profile = LEVEL_PROFILES[level];
  if (!profile) {
    throw new RangeError(`未対応のレベルです: ${level}`);
  }
  return profile;
}

export function generationProfiles(level) {
  const profile = levelProfile(level);
  return profile.variants || Object.freeze([profile]);
}

export function generationProfile(level, levelVariant) {
  const profiles = generationProfiles(level);
  if (profiles.length === 1) return profiles[0];
  const profile = profiles.find((candidate) => candidate.levelVariant === levelVariant);
  if (!profile) throw new RangeError(`レベル${level}の問題種別が不正です: ${levelVariant ?? "未指定"}`);
  return profile;
}
