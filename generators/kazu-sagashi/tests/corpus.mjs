import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { SUPPORTED_LEVELS, generationProfile, generationProfiles } from "../src/config.js";
import { buildProblem } from "../src/generator.js";
import { canonicalBoardSignature, validateProblem } from "../src/validator.js";

const CORPUS_SIZE = 10_000;
const WARMUP_SIZE = 100;

for (const level of SUPPORTED_LEVELS) {
  for (let index = 0; index < WARMUP_SIZE; index += 1) buildProblem(level, corpusSeed(index));

  const signatures = new Set();
  const positionsByProfile = new Map();
  const targetsByProfile = new Map();
  const profileCounts = new Map();
  const durations = [];
  let failures = 0;

  for (let index = 0; index < CORPUS_SIZE; index += 1) {
    const seed = corpusSeed(index);
    const start = performance.now();
    let problem;
    try {
      problem = buildProblem(level, seed);
    } catch (error) {
      failures += 1;
      console.error(`level ${level} seed ${seed}: ${error.message}`);
      continue;
    }
    durations.push(performance.now() - start);
    const validation = validateProblem(problem);
    assert.equal(validation.valid, true, `level ${level} seed ${seed}: ${validation.errors.join(" / ")}`);
    assert.equal(validation.solutions.length, 1);
    const profile = generationProfile(problem.level, problem.levelVariant);
    if (!positionsByProfile.has(profile.profileKey)) positionsByProfile.set(profile.profileKey, new Map());
    if (!targetsByProfile.has(profile.profileKey)) targetsByProfile.set(profile.profileKey, new Map());
    increment(profileCounts, profile.profileKey);
    signatures.add(canonicalBoardSignature(problem));
    increment(positionsByProfile.get(profile.profileKey), `${problem.answer.row},${problem.answer.col}`);
    increment(targetsByProfile.get(profile.profileKey), ruleBucket(problem));
  }

  assert.equal(failures, 0, `level ${level} generation failures`);
  const duplicateRate = (CORPUS_SIZE - signatures.size) / CORPUS_SIZE;
  assert.equal(duplicateRate <= 0.01, true, `level ${level} duplicate rate ${duplicateRate}`);
  const profiles = generationProfiles(level);
  assertUniform(profileCounts, profiles.length, `level ${level} problem variants`, CORPUS_SIZE);
  for (const profile of profiles) {
    const profileCount = profileCounts.get(profile.profileKey) || 0;
    const ruleBucketCount = profile.targets?.length || profile.targetPairs?.length || profile.relations?.length || profile.answerTriples.length;
    assertUniform(positionsByProfile.get(profile.profileKey) || new Map(), (profile.rows - 2) * (profile.cols - 2), `level ${level} ${profile.profileKey} answer positions`, profileCount);
    assertUniform(targetsByProfile.get(profile.profileKey) || new Map(), ruleBucketCount, `level ${level} ${profile.profileKey} targets or relations`, profileCount);
  }

  durations.sort((a, b) => a - b);
  const p95 = durations[Math.floor(durations.length * 0.95)];
  assert.equal(p95 < 500, true, `level ${level} p95 ${p95.toFixed(2)}ms`);
  console.log(
    `level ${level}: 10000 valid, duplicates ${(duplicateRate * 100).toFixed(2)}%, p95 ${p95.toFixed(2)}ms`
  );
}

function corpusSeed(index) {
  return `kazu-sagashi-corpus-${String(index).padStart(5, "0")}`;
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function ruleBucket(problem) {
  if (problem.mode === "triple-order") return problem.answerTriple.join(",");
  if (problem.mode === "pair-exact") return `${problem.rule.targetApple},${problem.rule.targetPear}`;
  if (problem.mode === "pair-relation") return problem.rule.relation;
  return problem.rule.targetApple;
}

function assertUniform(map, bucketCount, label, sampleCount) {
  const expected = sampleCount / bucketCount;
  assert.equal(map.size, bucketCount, `${label}: missing buckets`);
  for (const [key, count] of map) {
    assert.equal(count >= expected * 0.5 && count <= expected * 1.5, true, `${label} ${key}: ${count}`);
  }
}
