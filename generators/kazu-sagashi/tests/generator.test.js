import assert from "node:assert/strict";

import { LEVEL_PROFILES } from "../src/config.js";
import { buildProblem, buildWorksheet } from "../src/generator.js";
import { renderBoardHtml, renderWorksheet } from "../src/renderer.js";
import {
  analyzeProblem,
  canonicalBoardSignature,
  canonicalProblemSignature,
  enumerateWindowCounts,
  validateProblem,
} from "../src/validator.js";

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

test("levels 1 through 6 produce valid deterministic problems", () => {
  for (let level = 1; level <= 6; level += 1) {
    const first = buildProblem(level, "deterministic-seed", { questionIndex: 3, variantIndex: 2 });
    const second = buildProblem(level, "deterministic-seed", { questionIndex: 3, variantIndex: 2 });
    assert.deepEqual(first, second);
    const validation = validateProblem(first);
    assert.equal(validation.valid, true, validation.errors.join(" / "));
    const profile = LEVEL_PROFILES[level];
    assert.equal(first.grid.rows, profile.rows);
    assert.equal(first.grid.cols, profile.cols);
    assert.equal(first.grid.maxPerCell, profile.maxPerCell);
    assert.equal(first.mode, profile.mode);
    assert.equal(first.metrics.candidateWindowCount, (profile.rows - 2) * (profile.cols - 2));
    assert.equal(first.metrics.nearMissCount >= profile.requiredNearMissCount, true);
    assert.equal(first.metrics.adjacentNearMissCount >= profile.requiredAdjacentNearMissCount, true);
    if (level >= 5) {
      assert.deepEqual(first.grid.cellStates, ["empty", "apple", "pear"]);
      assert.equal(first.grid.cells.flat().every((value) => profile.cellValues.includes(value)), true);
      assert.equal(first.metrics.totalFruitCount, first.metrics.totalAppleCount + first.metrics.totalPearCount);
    }
    if (level === 6) {
      const answerWindow = validation.solutions[0];
      assert.equal(answerWindow.appleCount >= 1, true);
      assert.equal(answerWindow.pearCount >= 1, true);
    }
  }
});

test("normal CI corpus validates 200 fixed seeds per level", () => {
  for (let level = 1; level <= 6; level += 1) {
    for (let index = 0; index < 200; index += 1) {
      const seed = `kazu-sagashi-ci-${String(index).padStart(3, "0")}`;
      const problem = buildProblem(level, seed);
      const validation = validateProblem(problem);
      assert.equal(validation.valid, true, `level ${level} seed ${seed}: ${validation.errors.join(" / ")}`);
    }
  }
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
  const source = buildProblem(2, "validator-tamper");
  const zero = structuredCloneCompat(source);
  zero.rule.targetApple = 9;
  zero.metrics = null;
  assert.equal(validateProblem(zero, { compareMetrics: false }).valid, false);

  const multiple = structuredCloneCompat(source);
  multiple.grid.cells = Array.from({ length: 8 }, () => Array(8).fill(0));
  multiple.rule.targetApple = 0;
  multiple.metrics = null;
  const result = validateProblem(multiple, { compareMetrics: false });
  assert.equal(result.valid, false);
  assert.equal(result.solutions.length > 1, true);
});

test("board and problem signatures handle rotations and rule changes", () => {
  const problem = buildProblem(3, "signature-seed");
  const rotated = rotateProblem(problem);
  assert.equal(canonicalBoardSignature(problem), canonicalBoardSignature(rotated));
  assert.equal(canonicalProblemSignature(problem), canonicalProblemSignature(rotated));

  const changedRule = structuredCloneCompat(problem);
  changedRule.rule.targetApple += 1;
  assert.equal(canonicalBoardSignature(problem), canonicalBoardSignature(changedRule));
  assert.notEqual(canonicalProblemSignature(problem), canonicalProblemSignature(changedRule));
});

test("six-question worksheets contain no symmetric duplicate boards", () => {
  for (let level = 1; level <= 6; level += 1) {
    const problems = buildWorksheet(level, `worksheet-${level}`, { questionCount: 6 });
    assert.equal(problems.length, 6);
    assert.equal(new Set(problems.map(canonicalBoardSignature)).size, 6);
  }
});

test("question streams are independent of previous generation work", () => {
  const direct = buildProblem(3, "stream-seed", { questionIndex: 4 });
  buildWorksheet(3, "stream-seed", { questionCount: 4 });
  const after = buildProblem(3, "stream-seed", { questionIndex: 4 });
  assert.deepEqual(direct, after);
});

test("renderer exposes exact fruit instances and answer frame geometry", () => {
  let problem;
  for (let index = 0; index < 20; index += 1) {
    const candidate = buildProblem(4, `renderer-${index}`);
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
  assert.equal((html.match(/<use href=.*-apple"/g) || []).length, instanceCount);
  assert.match(html, /data-center-x="38"/);
  assert.match(html, /data-center-x="62"/);
  assert.match(html, new RegExp(`data-answer-row="${problem.answer.row}"`));
  assert.match(html, new RegExp(`data-answer-col="${problem.answer.col}"`));
  assert.match(renderWorksheet([problem]), /data-answer-mode="false"/);
  assert.match(renderWorksheet([problem], { answer: true }), /data-answer-mode="true"/);
});

test("pair renderer keeps apple and pear symbols exclusive", () => {
  for (const level of [5, 6]) {
    const problem = buildProblem(level, `pair-renderer-${level}`);
    const html = renderBoardHtml(problem, { answer: true });
    const occupied = problem.grid.cells.flat().filter((value) => value !== 0).length;
    assert.equal((html.match(/data-fruit-instance=/g) || []).length, occupied);
    assert.equal((html.match(/data-fruit-icon="bitten-apple"/g) || []).length, problem.metrics.totalAppleCount);
    assert.equal((html.match(/data-fruit-icon="pear"/g) || []).length, problem.metrics.totalPearCount);
    assert.equal((html.match(/<symbol /g) || []).length, 0);
    assert.equal((html.match(/<use href=.*-apple"/g) || []).length, problem.metrics.totalAppleCount);
    assert.equal((html.match(/<use href=.*-pear"/g) || []).length, problem.metrics.totalPearCount);
    assert.equal(/data-fruit-kind="pear"[^>]*data-fruit-count="2"/.test(html), false);
  }
});

test("worksheet reuses the page-level fruit symbols across six boards", () => {
  const problems = buildWorksheet(6, "sprite-reuse", { questionCount: 6 });
  const html = renderWorksheet(problems);
  assert.equal((html.match(/class="fruit-symbol-sprite"/g) || []).length, 0);
  assert.equal((html.match(/<symbol /g) || []).length, 0);
  assert.equal((html.match(/<use href=/g) || []).length, problems.reduce((sum, problem) => sum + problem.metrics.totalFruitCount, 0));
});

test("relation questions show furigana while aria labels remain plain text", () => {
  const problems = [];
  for (let index = 0; index < 30 && problems.length < 2; index += 1) {
    const problem = buildProblem(6, `furigana-${index}`);
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
  assert.throws(() => buildProblem(7, "future-level"), /未対応/);
  assert.throws(() => buildProblem(1, ""), /seed/);
  assert.throws(() => buildProblem(1, "seed", { variantIndex: 32 }), /上限/);

  const pair = buildProblem(5, "invalid-pair-cell");
  pair.grid.cells[0][0] = 3;
  pair.metrics = null;
  assert.equal(validateProblem(pair, { compareMetrics: false }).valid, false);
});

function pairProblem(relation, cells) {
  return {
    level: 6,
    mode: "pair-relation",
    grid: { rows: 8, cols: 8, maxPerCell: 1, cellStates: ["empty", "apple", "pear"], cells },
    rule: { windowRows: 3, windowCols: 3, relation },
    answer: { row: 0, col: 0 },
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
