import assert from "node:assert/strict";

import { SUPPORTED_LEVELS, generationProfile } from "../src/config.js";
import { buildProblem, buildWorksheet } from "../src/generator.js";
import { renderBoardHtml, renderWorksheet } from "../src/renderer.js";
import {
  analyzeProblem,
  canonicalBoardSignature,
  canonicalProblemSignature,
  enumerateWindowCounts,
  validateProblem,
} from "../src/validator.js";
import { distanceNeumann } from "../src/neumann-validator.js";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("candidate windows are enumerated for every initial board size", () => {
  for (const [size, expected] of [
    [6, 16],
    [8, 36],
    [9, 49],
    [10, 64],
  ]) {
    const grid = Array.from({ length: size }, () => Array(size).fill(0));
    assert.equal(enumerateWindowCounts(grid).length, expected);
  }
});

test("all four corners and stacked apples are counted", () => {
  const grid = Array.from({ length: 6 }, () => Array(6).fill(0));
  grid[0][0] = 2;
  grid[2][2] = 1;
  grid[3][3] = 2;
  grid[5][5] = 1;
  const windows = enumerateWindowCounts(grid);
  assert.equal(windows.find((window) => window.row === 0 && window.col === 0).count, 3);
  assert.equal(windows.find((window) => window.row === 3 && window.col === 3).count, 3);
});

test("source-derived stacked board has exactly one target window", () => {
  const rows = [
    "120120020",
    "200201200",
    "001002101",
    "120120020",
    "200201200",
    "001002011",
    "010010020",
    "200201200",
    "001002011",
  ];
  const grid = rows.map((row) => [...row].map(Number));
  const solutions = enumerateWindowCounts(grid).filter((window) => window.count === 7);
  assert.deepEqual(solutions, [{ row: 3, col: 4, count: 7, appleCount: 7, pearCount: 0 }]);
});

test("public numeric levels produce valid deterministic problems", () => {
  for (const level of [1, 2, 3]) {
    const first = buildProblem(level, "deterministic-seed", { questionIndex: 3, variantIndex: 2 });
    const second = buildProblem(level, "deterministic-seed", { questionIndex: 3, variantIndex: 2 });
    assert.deepEqual(first, second);
    const validation = validateProblem(first);
    assert.equal(validation.valid, true, validation.errors.join(" / "));
    const profile = generationProfile(level, first.levelVariant);
    assert.equal(first.grid.rows, profile.rows);
    assert.equal(first.grid.cols, profile.cols);
    assert.equal(first.grid.maxPerCell, profile.maxPerCell);
    assert.equal(first.mode, profile.mode);
    assert.equal(first.metrics.candidateWindowCount, (profile.rows - 2) * (profile.cols - 2));
    assert.equal(first.metrics.nearMissCount >= profile.requiredNearMissCount, true);
    assert.equal(first.metrics.adjacentNearMissCount >= profile.requiredAdjacentNearMissCount, true);
    if (profile.cellStates) {
      assert.deepEqual(first.grid.cellStates, ["empty", "apple", "pear"]);
      assert.equal(first.grid.cells.flat().every((value) => profile.cellValues.includes(value)), true);
      assert.equal(first.metrics.totalFruitCount, first.metrics.totalAppleCount + first.metrics.totalPearCount);
    }
    if (level === 3) {
      const answerWindow = validation.solutions[0];
      assert.equal(answerWindow.appleCount >= 1, true);
      assert.equal(answerWindow.pearCount >= 1, true);
    }
  }
});

test("normal CI corpus validates 200 fixed seeds per public level", () => {
  for (const level of [1, 2, 3]) {
    for (let index = 0; index < 200; index += 1) {
      const seed = `kazu-sagashi-ci-${String(index).padStart(3, "0")}`;
      const problem = buildProblem(level, seed);
      const validation = validateProblem(problem);
      assert.equal(validation.valid, true, `level ${level} seed ${seed}: ${validation.errors.join(" / ")}`);
    }
  }
});

test("level 2 worksheets balance and deterministically shuffle all three variants", () => {
  for (let questionCount = 1; questionCount <= 6; questionCount += 1) {
    const first = buildWorksheet(2, "mixed-level", { questionCount });
    const second = buildWorksheet(2, "mixed-level", { questionCount });
    assert.deepEqual(first, second);
    const counts = new Map();
    for (const problem of first) counts.set(problem.levelVariant, (counts.get(problem.levelVariant) || 0) + 1);
    assert.equal(counts.size, Math.min(questionCount, 3));
    const values = [...counts.values()];
    assert.equal(Math.max(...values) - Math.min(...values) <= 1, true);
  }
  const six = buildWorksheet(2, "mixed-level", { questionCount: 6 });
  assert.deepEqual([...countVariants(six).entries()].sort(), [["2A", 2], ["2B", 2], ["2C", 2]]);
});

test("Neumann validates 200 fixed seeds with every difficulty contract", () => {
  const triples = new Set();
  for (let index = 0; index < 200; index += 1) {
    const seed = `kazu-sagashi-neumann-ci-${String(index).padStart(3, "0")}`;
    const first = buildProblem(7, seed);
    const second = buildProblem(7, seed);
    assert.deepEqual(first, second);
    const validation = validateProblem(first);
    assert.equal(validation.valid, true, `${seed}: ${validation.errors.join(" / ")}`);
    assert.equal(first.levelLabel, "ノイマン");
    assert.equal(first.mode, "triple-order");
    assert.equal(first.metrics.firstPartialCandidateCount >= 8, true);
    assert.equal(first.metrics.secondPartialCandidateCount >= 8, true);
    assert.equal(first.metrics.typeLeftCount >= 3, true);
    assert.equal(first.metrics.typeRightCount >= 3, true);
    assert.equal(first.metrics.distractorRegionCount >= 3, true);
    assert.equal(Math.min(first.metrics.sameAppleCount, first.metrics.samePearCount, first.metrics.sameOrangeCount, first.metrics.sameTotalCount) >= 5, true);
    assert.equal(Math.min(
      first.metrics.sameApplePearCount,
      first.metrics.sameAppleOrangeCount,
      first.metrics.samePearOrangeCount,
      first.metrics.sameAppleTotalCount,
      first.metrics.samePearTotalCount,
      first.metrics.sameOrangeTotalCount,
      first.metrics.sameAppleClusterCount,
      first.metrics.samePearClusterCount,
      first.metrics.sameOrangeClusterCount,
      first.metrics.sameTotalClusterCount
    ) >= 3, true);
    assert.equal(first.metrics.visualRoughOrderExpectedRank >= 3, true);
    assert.equal(first.metrics.visualOrderDensityExpectedRank >= 3, true);
    assert.equal(first.metrics.visualShapeDensityExpectedRank >= 3, true);
    assert.equal(first.metrics.visualCombinedExpectedRank >= 3, true);
    assert.equal(first.metrics.visualMinimumExpectedRank >= 3, true);
    triples.add(first.answerTriple.join(","));
  }
  assert.deepEqual([...triples].sort(), ["1,2,3", "1,2,4", "1,3,4"]);
});

test("Neumann predicate has exactly seven possible count triples", () => {
  const triples = [];
  for (let apple = 0; apple <= 9; apple += 1) {
    for (let pear = 0; pear <= 9 - apple; pear += 1) {
      for (let orange = 0; orange <= 9 - apple - pear; orange += 1) {
        if (apple >= 1 && apple < pear && pear < orange) triples.push(`${apple},${pear},${orange}`);
      }
    }
  }
  assert.deepEqual(triples.sort(), ["1,2,3", "1,2,4", "1,2,5", "1,2,6", "1,3,4", "1,3,5", "2,3,4"]);
  assert.equal(distanceNeumann({ emptyCount: 3, appleCount: 1, pearCount: 2, orangeCount: 3 }), 0);
  assert.equal(distanceNeumann({ emptyCount: 3, appleCount: 2, pearCount: 2, orangeCount: 2 }), 1);
});

test("Neumann worksheets contain six distinct valid problems", () => {
  const problems = buildWorksheet(7, "neumann-worksheet", { questionCount: 6 });
  assert.equal(problems.length, 6);
  assert.equal(new Set(problems.map(canonicalBoardSignature)).size, 6);
  for (const problem of problems) assert.equal(validateProblem(problem).valid, true);
});

test("Neumann rejects the KS-N-0RTTQSI visual-shortcut regression", () => {
  const cells = [
    [3,0,0,1,3,3,2,3,1,3],
    [1,2,2,0,2,0,0,0,3,0],
    [0,0,2,0,0,0,0,0,0,3],
    [2,0,0,1,3,3,0,2,3,0],
    [0,0,0,3,2,0,2,2,3,0],
    [2,3,3,0,3,2,2,1,0,1],
    [0,0,3,0,0,1,1,1,1,0],
    [2,1,1,0,3,3,2,3,2,1],
    [1,3,2,2,1,0,3,2,0,0],
    [0,1,0,3,3,0,3,0,0,0],
  ];
  const result = validateProblem(neumannProblem(cells, { row: 3, col: 3 }), { compareMetrics: false });
  assert.equal(result.valid, false);
  assert.equal(result.errors.includes("二つの手掛かりの組み合わせで正解位置が漏れます"), true);
  assert.equal(result.metrics.sameOrangeTotalCount, 1);
  assert.equal(result.metrics.sameOrangeClusterCount, 1);
});

test("Neumann rejects a board ranked in the top two by visual salience", () => {
  const cells = [
    [3,2,3,3,1,2,0,3,1,0],
    [1,0,2,0,3,2,0,2,2,3],
    [2,3,3,0,0,0,0,2,0,1],
    [0,0,0,3,1,2,2,0,2,0],
    [1,0,1,0,2,0,1,1,2,3],
    [2,0,2,0,2,0,3,1,3,1],
    [0,3,2,3,1,2,3,0,0,0],
    [3,3,2,3,0,1,1,3,2,0],
    [3,2,2,2,3,1,3,3,3,0],
    [1,1,0,3,3,1,2,1,3,0],
  ];
  const result = validateProblem(neumannProblem(cells, { row: 0, col: 0 }), { compareMetrics: false });
  assert.equal(result.valid, false);
  assert.equal(result.errors.includes("見た目の目立ち方だけで正解候補が上位に来ます"), true);
  assert.equal(result.metrics.visualMinimumExpectedRank, 2.5);
});

test("pair predicates include degenerate windows exactly as written", () => {
  const equal = pairProblem("equal", Array.from({ length: 8 }, () => Array(8).fill(0)));
  assert.equal(analyzeProblem(equal).solutions.length, 36, "(0, 0) must satisfy equal");

  const appleLessCells = Array.from({ length: 8 }, () => Array(8).fill(0));
  appleLessCells[0][0] = 2;
  const appleLess = pairProblem("apple-less", appleLessCells);
  const topLeft = analyzeProblem(appleLess).solutions.find((window) => window.row === 0 && window.col === 0);
  assert.ok(topLeft, "(0, 1) must satisfy apple-less");
  assert.equal(topLeft.appleCount, 0);
  assert.equal(topLeft.pearCount, 1);
});

test("validator rejects zero-solution and multiple-solution tampering", () => {
  const source = level2ProblemByVariant("validator-tamper", "2A");
  const zero = structuredCloneCompat(source);
  zero.rule.targetApple = 9;
  zero.metrics = null;
  assert.equal(validateProblem(zero, { compareMetrics: false }).valid, false);

  const multiple = structuredCloneCompat(source);
  multiple.grid.cells = Array.from({ length: source.grid.rows }, () => Array(source.grid.cols).fill(0));
  multiple.rule.targetApple = 0;
  multiple.metrics = null;
  const result = validateProblem(multiple, { compareMetrics: false });
  assert.equal(result.valid, false);
  assert.equal(result.solutions.length > 1, true);
});

test("board and problem signatures handle rotations and rule changes", () => {
  const problem = level2ProblemByVariant("signature-seed", "2A");
  const rotated = rotateProblem(problem);
  assert.equal(canonicalBoardSignature(problem), canonicalBoardSignature(rotated));
  assert.equal(canonicalProblemSignature(problem), canonicalProblemSignature(rotated));

  const changedRule = structuredCloneCompat(problem);
  changedRule.rule.targetApple += 1;
  assert.equal(canonicalBoardSignature(problem), canonicalBoardSignature(changedRule));
  assert.notEqual(canonicalProblemSignature(problem), canonicalProblemSignature(changedRule));
});

test("six-question worksheets contain no symmetric duplicate boards", () => {
  for (const level of SUPPORTED_LEVELS) {
    const problems = buildWorksheet(level, `worksheet-${level}`, { questionCount: 6 });
    assert.equal(problems.length, 6);
    assert.equal(new Set(problems.map(canonicalBoardSignature)).size, 6);
  }
});

test("question streams are independent of previous generation work", () => {
  const direct = buildProblem(2, "stream-seed", { questionIndex: 4 });
  buildWorksheet(2, "stream-seed", { questionCount: 4 });
  const after = buildProblem(2, "stream-seed", { questionIndex: 4 });
  assert.deepEqual(direct, after);
});

test("renderer exposes exact fruit instances and answer frame geometry", () => {
  let problem;
  for (let index = 0; index < 20; index += 1) {
    const candidate = level2ProblemByVariant(`renderer-${index}`, "2B");
    if (candidate.grid.cells.some((row) => row.includes(2))) {
      problem = candidate;
      break;
    }
  }
  assert.ok(problem);
  const html = renderBoardHtml(problem, { answer: true });
  const instanceCount = (html.match(/data-fruit-instance=/g) || []).length;
  const iconCount = (html.match(/data-fruit-icon="bitten-apple"/g) || []).length;
  assert.equal(instanceCount, problem.metrics.totalFruitCount);
  assert.equal(iconCount, instanceCount);
  assert.equal((html.match(/<symbol /g) || []).length, 0);
  assert.equal((html.match(/<use href=/g) || []).length, 0);
  assert.match(html, /data-center-x="38"/);
  assert.match(html, /data-center-x="62"/);
  assert.match(html, new RegExp(`data-answer-row="${problem.answer.row}"`));
  assert.match(html, new RegExp(`data-answer-col="${problem.answer.col}"`));
  assert.match(renderWorksheet([problem]), /data-answer-mode="false"/);
  assert.match(renderWorksheet([problem], { answer: true }), /data-answer-mode="true"/);
});

test("pair renderer keeps apple and pear symbols exclusive", () => {
  for (const problem of [level2ProblemByVariant("pair-renderer-2C", "2C"), buildProblem(3, "pair-renderer-3")]) {
    const html = renderBoardHtml(problem, { answer: true });
    const occupied = problem.grid.cells.flat().filter((value) => value !== 0).length;
    assert.equal((html.match(/data-fruit-instance=/g) || []).length, occupied);
    assert.equal((html.match(/data-fruit-icon="bitten-apple"/g) || []).length, problem.metrics.totalAppleCount);
    assert.equal((html.match(/data-fruit-icon="pear"/g) || []).length, problem.metrics.totalPearCount);
    assert.equal((html.match(/<symbol /g) || []).length, 0);
    assert.equal((html.match(/<use href=/g) || []).length, 0);
    assert.equal(/data-fruit-kind="pear"[^>]*data-fruit-count="2"/.test(html), false);
  }
});

test("Neumann renderer shows three exclusive fruit symbols and its level name", () => {
  const problem = buildProblem(7, "neumann-renderer");
  const html = renderWorksheet([problem]);
  const answerHtml = renderProblemCardForTest(problem);
  assert.match(html, /レベル: ノイマン/);
  assert.match(html, /1こ<ruby>以上<rt>いじょう<\/rt><\/ruby>/);
  assert.match(html, /<ruby>順<rt>じゅん<\/rt><\/ruby>/);
  assert.match(html, /<ruby>数<rt>かず<\/rt><\/ruby>/);
  assert.match(html, /aria-label="リンゴよりナシが多い。ナシよりミカンが多い。"/);
  assert.equal((html.match(/data-legend-fruit=/g) || []).length, 4);
  assert.doesNotMatch(html, /class="order-sign"/);
  assert.doesNotMatch(html, /&lt;/);
  assert.equal((html.match(/data-fruit-icon="bitten-apple"/g) || []).length, problem.metrics.totalAppleCount);
  assert.equal((html.match(/data-fruit-icon="pear"/g) || []).length, problem.metrics.totalPearCount);
  assert.equal((html.match(/data-fruit-icon="orange"/g) || []).length, problem.metrics.totalOrangeCount);
  assert.match(answerHtml, /ミカン\d+こ/);
  assert.match(answerHtml, /（じゅんに多い）/);
  assert.doesNotMatch(answerHtml, /&lt;/);
});

test("worksheet inlines printable fruit drawings across six boards", () => {
  const problems = buildWorksheet(3, "sprite-reuse", { questionCount: 6 });
  const html = renderWorksheet(problems);
  assert.equal((html.match(/class="fruit-symbol-sprite"/g) || []).length, 0);
  assert.equal((html.match(/<symbol /g) || []).length, 0);
  assert.equal((html.match(/<use href=/g) || []).length, 0);
  assert.equal((html.match(/data-fruit-instance=/g) || []).length, problems.reduce((sum, problem) => sum + problem.metrics.totalFruitCount, 0));
});

test("relation questions show furigana while aria labels remain plain text", () => {
  const problems = [];
  for (let index = 0; index < 30 && problems.length < 2; index += 1) {
    const problem = buildProblem(3, `furigana-${index}`);
    if (!problems.some((item) => item.rule.relation === problem.rule.relation)) {
      problems.push(problem);
    }
  }
  assert.equal(problems.length, 2);

  const html = renderWorksheet(problems);
  assert.match(html, /<ruby>同じ<rt>おなじ<\/rt><\/ruby><ruby>数<rt>かず<\/rt><\/ruby>/);
  assert.match(html, /<ruby>少ない<rt>すくない<\/rt><\/ruby>/);
  assert.match(html, /aria-label="[^"]*同じ数はどこ？/);
  assert.match(html, /aria-label="[^"]*少ないのはどこ？/);
  assert.doesNotMatch(html, /aria-label="[^"]*<ruby>/);
});

test("invalid inputs fail explicitly without level fallback", () => {
  assert.throws(() => buildProblem(8, "future-level"), /未対応/);
  for (const removedLevel of [4, 5, 6]) assert.throws(() => buildProblem(removedLevel, "removed-level"), /未対応/);
  assert.throws(() => buildProblem(1, ""), /seed/);
  assert.throws(() => buildProblem(1, "seed", { variantIndex: 32 }), /上限/);

  const pair = level2ProblemByVariant("invalid-pair-cell", "2C");
  pair.grid.cells[0][0] = 3;
  pair.metrics = null;
  assert.equal(validateProblem(pair, { compareMetrics: false }).valid, false);
});

function renderProblemCardForTest(problem) {
  return renderWorksheet([problem], { answer: true });
}

function pairProblem(relation, cells) {
  return {
    level: 3,
    mode: "pair-relation",
    grid: { rows: 8, cols: 8, maxPerCell: 1, cellStates: ["empty", "apple", "pear"], cells },
    rule: { windowRows: 3, windowCols: 3, relation },
    answer: { row: 0, col: 0 },
  };
}

function level2ProblemByVariant(seed, levelVariant) {
  const problem = buildWorksheet(2, seed, { questionCount: 3 }).find((candidate) => candidate.levelVariant === levelVariant);
  assert.ok(problem, `missing ${levelVariant}`);
  return problem;
}

function countVariants(problems) {
  const counts = new Map();
  for (const problem of problems) counts.set(problem.levelVariant, (counts.get(problem.levelVariant) || 0) + 1);
  return counts;
}

function neumannProblem(cells, answer) {
  return {
    level: 7,
    levelLabel: "ノイマン",
    mode: "triple-order",
    grid: { rows: 10, cols: 10, maxPerCell: 1, cellStates: ["empty", "apple", "pear", "orange"], cells },
    rule: {
      windowRows: 3,
      windowCols: 3,
      order: ["apple", "pear", "orange"],
      comparison: "strictly-increasing",
      minimumEach: 1,
    },
    answer,
  };
}

function rotateProblem(problem) {
  const rotated = structuredCloneCompat(problem);
  const cells = problem.grid.cells;
  const size = cells.length;
  rotated.grid.cells = Array.from({ length: size }, () => Array(size).fill(0));
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) rotated.grid.cells[col][size - 1 - row] = cells[row][col];
  }
  rotated.answer = { row: problem.answer.col, col: size - 3 - problem.answer.row };
  rotated.metrics = analyzeProblem(rotated).metrics;
  return rotated;
}

function structuredCloneCompat(value) {
  return JSON.parse(JSON.stringify(value));
}
