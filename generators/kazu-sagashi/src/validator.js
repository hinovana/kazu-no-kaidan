import { levelProfile } from "./config.js";

const EPSILON = 1e-12;

export function enumerateWindowCounts(grid, mode = "single-exact") {
  const rows = grid.length;
  const cols = grid[0]?.length || 0;
  const windows = [];
  for (let row = 0; row <= rows - 3; row += 1) {
    for (let col = 0; col <= cols - 3; col += 1) {
      let appleCount = 0;
      let pearCount = 0;
      for (let dy = 0; dy < 3; dy += 1) {
        for (let dx = 0; dx < 3; dx += 1) {
          const value = grid[row + dy][col + dx];
          if (isPairMode(mode)) {
            if (value === 1) appleCount += 1;
            if (value === 2) pearCount += 1;
          } else {
            appleCount += value;
          }
        }
      }
      windows.push({ row, col, count: appleCount, appleCount, pearCount });
    }
  }
  return windows;
}

export function analyzeProblem(problem) {
  const profile = levelProfile(problem.level);
  const cells = problem.grid.cells;
  const windows = enumerateWindowCounts(cells, problem.mode).map((window) => ({
    ...window,
    distance: ruleDistance(problem.rule, window.appleCount, window.pearCount),
  }));
  const solutions = windows.filter((window) => window.distance === 0);
  const nearMisses = windows.filter((window) => window.distance === 1);
  const adjacentNearMisses = nearMisses.filter(
    (window) =>
      Math.max(Math.abs(window.row - problem.answer.row), Math.abs(window.col - problem.answer.col)) === 1
  );

  let occupiedCellCount = 0;
  let totalAppleCount = 0;
  let totalPearCount = 0;
  for (const row of cells) {
    for (const value of row) {
      if (value !== 0) occupiedCellCount += 1;
      if (isPairMode(problem.mode)) {
        if (value === 1) totalAppleCount += 1;
        if (value === 2) totalPearCount += 1;
      } else {
        totalAppleCount += value;
      }
    }
  }

  let answerOccupiedCellCount = 0;
  let answerFruitCount = 0;
  for (let dy = 0; dy < 3; dy += 1) {
    for (let dx = 0; dx < 3; dx += 1) {
      const value = cells[problem.answer.row + dy][problem.answer.col + dx];
      if (value !== 0) answerOccupiedCellCount += 1;
      if (isPairMode(problem.mode)) answerFruitCount += value === 0 ? 0 : 1;
      else answerFruitCount += value;
    }
  }

  const totalFruitCount = totalAppleCount + totalPearCount;
  const cellCount = profile.rows * profile.cols;
  const densityDenominator = isPairMode(problem.mode) ? cellCount : cellCount * profile.maxPerCell;
  const answerDensityDenominator = isPairMode(problem.mode) ? 9 : 9 * profile.maxPerCell;
  const occupiedCellDensity = occupiedCellCount / cellCount;
  const fruitLoadDensity = totalFruitCount / densityDenominator;
  const answerOccupiedCellDensity = answerOccupiedCellCount / 9;
  const answerFruitLoadDensity = answerFruitCount / answerDensityDenominator;
  const uniformLineViolationCount = countUniformLineViolations(cells);

  return {
    windows,
    solutions,
    nearMisses,
    adjacentNearMisses,
    metrics: {
      candidateWindowCount: windows.length,
      solutionCount: solutions.length,
      nearMissCount: nearMisses.length,
      adjacentNearMissCount: adjacentNearMisses.length,
      occupiedCellCount,
      totalAppleCount,
      totalPearCount,
      totalFruitCount,
      occupiedCellDensity,
      fruitLoadDensity,
      answerOccupiedCellDensity,
      answerFruitLoadDensity,
      uniformLineViolationCount,
    },
  };
}

export function validateProblem(problem, options = {}) {
  const errors = [];
  if (!problem || typeof problem !== "object") {
    return { valid: false, errors: ["問題データがありません"], metrics: null, solutions: [] };
  }

  let profile;
  try {
    profile = levelProfile(problem.level);
  } catch (error) {
    return { valid: false, errors: [error.message], metrics: null, solutions: [] };
  }

  if (problem.mode !== profile.mode) errors.push(`modeがレベル${profile.level}と一致しません`);
  if (problem.grid?.rows !== profile.rows || problem.grid?.cols !== profile.cols) {
    errors.push("盤面サイズがレベル設定と一致しません");
  }
  if (problem.grid?.maxPerCell !== profile.maxPerCell) errors.push("maxPerCellがレベル設定と一致しません");
  validateRule(problem.rule, profile, errors);
  if (problem.rule?.windowRows !== 3 || problem.rule?.windowCols !== 3) {
    errors.push("探索枠は3×3でなければなりません");
  }
  if (profile.cellStates && JSON.stringify(problem.grid?.cellStates) !== JSON.stringify(profile.cellStates)) {
    errors.push("セル状態の意味がレベル設定と一致しません");
  }

  const cells = problem.grid?.cells;
  if (!Array.isArray(cells) || cells.length !== profile.rows) {
    errors.push("盤面の行数が不正です");
    return { valid: false, errors, metrics: null, solutions: [] };
  }
  for (const row of cells) {
    if (!Array.isArray(row) || row.length !== profile.cols) {
      errors.push("盤面の列数が不正です");
      return { valid: false, errors, metrics: null, solutions: [] };
    }
    for (const value of row) {
      if (!profile.cellValues.includes(value)) errors.push(`許可されていないセル値です: ${value}`);
    }
  }

  const answerRow = problem.answer?.row;
  const answerCol = problem.answer?.col;
  if (
    !Number.isInteger(answerRow) ||
    !Number.isInteger(answerCol) ||
    answerRow < 0 ||
    answerCol < 0 ||
    answerRow > profile.rows - 3 ||
    answerCol > profile.cols - 3
  ) {
    errors.push("正解枠が盤面内に収まりません");
    return { valid: false, errors, metrics: null, solutions: [] };
  }

  const analysis = analyzeProblem(problem);
  const { metrics, solutions } = analysis;
  const expectedWindowCount = (profile.rows - 2) * (profile.cols - 2);
  if (metrics.candidateWindowCount !== expectedWindowCount) errors.push("候補枠数が不正です");
  if (solutions.length !== 1) errors.push(`正解枠が${solutions.length}か所あります`);
  if (solutions.length === 1 && (solutions[0].row !== answerRow || solutions[0].col !== answerCol)) {
    errors.push("唯一の正解枠とanswer座標が一致しません");
  }
  if (profile.mode === "pair-relation") {
    const answerWindow = analysis.windows.find((window) => window.row === answerRow && window.col === answerCol);
    if (!answerWindow || answerWindow.appleCount < 1 || answerWindow.pearCount < 1) {
      errors.push("レベル6の正解枠にはリンゴとナシが1個以上必要です");
    }
  }
  if (metrics.nearMissCount < profile.requiredNearMissCount) errors.push("近似枠数がレベル条件を満たしません");
  if (metrics.adjacentNearMissCount < profile.requiredAdjacentNearMissCount) {
    errors.push("隣接近似枠がレベル条件を満たしません");
  }
  if (!inRange(metrics.occupiedCellDensity, 0.2, 0.8)) errors.push("占有密度が範囲外です");
  if (!inRange(metrics.fruitLoadDensity, 0.2, 0.8)) errors.push("果物量密度が範囲外です");
  if (Math.abs(metrics.answerOccupiedCellDensity - metrics.occupiedCellDensity) > 0.35 + EPSILON) {
    errors.push("正解枠と盤面の占有密度差が大きすぎます");
  }
  if (Math.abs(metrics.answerFruitLoadDensity - metrics.fruitLoadDensity) > 0.35 + EPSILON) {
    errors.push("正解枠と盤面の果物量密度差が大きすぎます");
  }
  if (metrics.uniformLineViolationCount !== 0) errors.push("一様な行または列が連続しています");

  if (options.compareMetrics !== false && problem.metrics) {
    for (const [key, value] of Object.entries(metrics)) {
      if (!sameMetric(problem.metrics[key], value)) errors.push(`metrics.${key}が再計算値と一致しません`);
    }
  }

  return { valid: errors.length === 0, errors, metrics, solutions };
}

export function canonicalBoardSignature(problem) {
  const cellStates = problem.grid.cellStates || [`apple-count-0-${problem.grid.maxPerCell}`];
  return transformationPayloads(problem)
    .map(({ cells }) => JSON.stringify({ cellStates, cells }))
    .sort()[0];
}

export function canonicalProblemSignature(problem) {
  const cellStates = problem.grid.cellStates || [`apple-count-0-${problem.grid.maxPerCell}`];
  return transformationPayloads(problem)
    .map(({ cells, answer }) =>
      JSON.stringify({
        cellStates,
        mode: problem.mode,
        rule: problem.rule,
        cells,
        answer,
      })
    )
    .sort()[0];
}

function validateRule(rule, profile, errors) {
  if (!rule || typeof rule !== "object") {
    errors.push("問題条件がありません");
    return;
  }
  if (profile.mode === "pair-exact") {
    const valid = profile.targetPairs.some(
      (target) => target.targetApple === rule.targetApple && target.targetPear === rule.targetPear
    );
    if (!valid) errors.push("リンゴとナシの目標値がレベル設定の範囲外です");
    return;
  }
  if (profile.mode === "pair-relation") {
    if (!profile.relations.includes(rule.relation)) errors.push("関係条件がレベル設定の範囲外です");
    return;
  }
  if (!profile.targets.includes(rule.targetApple)) errors.push("目標値がレベル設定の範囲外です");
}

function ruleDistance(rule, appleCount, pearCount) {
  if (rule.relation === "equal") return Math.abs(appleCount - pearCount);
  if (rule.relation === "apple-less") return appleCount < pearCount ? 0 : appleCount - pearCount + 1;
  if (Number.isInteger(rule.targetPear)) {
    return Math.abs(appleCount - rule.targetApple) + Math.abs(pearCount - rule.targetPear);
  }
  return Math.abs(appleCount - rule.targetApple);
}

function isPairMode(mode) {
  return mode === "pair-exact" || mode === "pair-relation";
}

function transformationPayloads(problem) {
  const payloads = [];
  let cells = problem.grid.cells.map((row) => [...row]);
  let answer = { ...problem.answer };
  for (let turn = 0; turn < 4; turn += 1) {
    payloads.push({ cells, answer });
    payloads.push(reflectPayload(cells, answer));
    const rotated = rotatePayload(cells, answer);
    cells = rotated.cells;
    answer = rotated.answer;
  }
  return payloads;
}

function rotatePayload(cells, answer) {
  const size = cells.length;
  const rotated = Array.from({ length: size }, () => Array(size).fill(0));
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) rotated[col][size - 1 - row] = cells[row][col];
  }
  return {
    cells: rotated,
    answer: { row: answer.col, col: size - 3 - answer.row },
  };
}

function reflectPayload(cells, answer) {
  const size = cells.length;
  return {
    cells: cells.map((row) => [...row].reverse()),
    answer: { row: answer.row, col: size - 3 - answer.col },
  };
}

function countUniformLineViolations(cells) {
  const rows = cells.map(lineKind);
  const cols = Array.from({ length: cells[0].length }, (_, col) => lineKind(cells.map((row) => row[col])));
  return countAdjacentSameUniform(rows) + countAdjacentSameUniform(cols);
}

function lineKind(values) {
  if (values.every((value) => value === 0)) return "empty";
  if (values.every((value) => value !== 0)) return "filled";
  return "mixed";
}

function countAdjacentSameUniform(kinds) {
  let count = 0;
  for (let index = 1; index < kinds.length; index += 1) {
    if (kinds[index] !== "mixed" && kinds[index] === kinds[index - 1]) count += 1;
  }
  return count;
}

function inRange(value, min, max) {
  return value >= min - EPSILON && value <= max + EPSILON;
}

function sameMetric(actual, expected) {
  if (typeof expected === "number" && !Number.isInteger(expected)) {
    return typeof actual === "number" && Math.abs(actual - expected) <= EPSILON;
  }
  return actual === expected;
}
