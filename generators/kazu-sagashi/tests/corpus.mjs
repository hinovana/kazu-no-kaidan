import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { LEVEL_PROFILES } from "../src/config.js";
import { buildProblem } from "../src/generator.js";
import { canonicalBoardSignature, validateProblem } from "../src/validator.js";

const CORPUS_SIZE = 10_000;
const WARMUP_SIZE = 100;

for (let level = 1; level <= 7; level += 1) {
  for (let index = 0; index < WARMUP_SIZE; index += 1) buildProblem(level, corpusSeed(index));

  const profile = LEVEL_PROFILES[level];
  const signatures = new Set();
  const positions = new Map();
  const targets = new Map();
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
    signatures.add(canonicalBoardSignature(problem));
    increment(positions, `${problem.answer.row},${problem.answer.col}`);
    increment(targets, ruleBucket(problem));
  }

  assert.equal(failures, 0, `level ${level} generation failures`);
  const duplicateRate = (CORPUS_SIZE - signatures.size) / CORPUS_SIZE;
  assert.equal(duplicateRate <= 0.01, true, `level ${level} duplicate rate ${duplicateRate}`);
  assertUniform(positions, (profile.rows - 2) * (profile.cols - 2), `level ${level} answer positions`);
  const ruleBucketCount = profile.targets?.length || profile.targetPairs?.length || profile.relations?.length || profile.answerTriples.length;
  assertUniform(targets, ruleBucketCount, `level ${level} targets or relations`);

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

function assertUniform(map, bucketCount, label) {
  const expected = CORPUS_SIZE / bucketCount;
  assert.equal(map.size, bucketCount, `${label}: missing buckets`);
  for (const [key, count] of map) {
    assert.equal(count >= expected * 0.5 && count <= expected * 1.5, true, `${label} ${key}: ${count}`);
  }
}
