import { levelProfile } from "./config.js?v=4";

const EPSILON = 1e-12;
const ANSWER_TRIPLES = new Set(["1,2,3", "1,2,4", "1,3,4"]);
const DISTANCE_TARGETS = validHistograms();
const JOINT_CUES = Object.freeze([
  ["sameApplePearCount", "appleCount", "pearCount"],
  ["sameAppleOrangeCount", "appleCount", "orangeCount"],
  ["samePearOrangeCount", "pearCount", "orangeCount"],
  ["sameAppleTotalCount", "appleCount", "totalFruitCount"],
  ["samePearTotalCount", "pearCount", "totalFruitCount"],
  ["sameOrangeTotalCount", "orangeCount", "totalFruitCount"],
  ["sameAppleClusterCount", "appleCount", "largestOccupiedCluster"],
  ["samePearClusterCount", "pearCount", "largestOccupiedCluster"],
  ["sameOrangeClusterCount", "orangeCount", "largestOccupiedCluster"],
  ["sameTotalClusterCount", "totalFruitCount", "largestOccupiedCluster"],
]);

export function analyzeNeumannProblem(problem) {
  const cells = problem.grid.cells;
  const answer = problem.answer;
  const windows = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const counts = countWindow(cells, row, col);
      windows.push({ row, col, ...counts, distance: distanceNeumann(counts) });
    }
  }

  const solutions = windows.filter(matchesRule);
  const firstPartial = windows.filter((window) => window.appleCount >= 1 && window.appleCount < window.pearCount);
  const secondPartial = windows.filter((window) => window.pearCount < window.orangeCount);
  const typeLeft = windows.filter(
    (window) =>
      !matchesRule(window) &&
      window.appleCount >= 1 &&
      window.appleCount < window.pearCount &&
      window.pearCount >= window.orangeCount &&
      window.pearCount - window.orangeCount <= 1
  );
  const typeRight = windows.filter(
    (window) =>
      !matchesRule(window) &&
      window.appleCount >= window.pearCount &&
      window.pearCount < window.orangeCount &&
      window.appleCount - window.pearCount <= 1 &&
      window.pearCount >= 1
  );
  const distractorRegions = new Set([...typeLeft, ...typeRight].map((window) => `${Math.floor(window.row / 4)},${Math.floor(window.col / 4)}`));
  const answerWindow = windows.find((window) => window.row === answer.row && window.col === answer.col);
  const sameAppleCount = windows.filter((window) => window.appleCount === answerWindow.appleCount).length;
  const samePearCount = windows.filter((window) => window.pearCount === answerWindow.pearCount).length;
  const sameOrangeCount = windows.filter((window) => window.orangeCount === answerWindow.orangeCount).length;
  const sameTotalCount = windows.filter((window) => window.totalFruitCount === answerWindow.totalFruitCount).length;
  const jointCueCounts = Object.fromEntries(
    JOINT_CUES.map(([metric, first, second]) => [
      metric,
      windows.filter((window) => window[first] === answerWindow[first] && window[second] === answerWindow[second]).length,
    ])
  );
  const nearMisses = windows.filter((window) => window.distance === 1);
  const adjacentNearMisses = nearMisses.filter(
    (window) => Math.max(Math.abs(window.row - answer.row), Math.abs(window.col - answer.col)) === 1
  );

  const totals = boardTotals(cells);
  const totalFruitCount = totals.apple + totals.pear + totals.orange;
  const occupiedCellDensity = totalFruitCount / 100;
  const answerOccupiedCellDensity = answerWindow.totalFruitCount / 9;
  const visualRankViolation = ["appleCount", "pearCount", "orangeCount", "totalFruitCount"].reduce(
    (sum, key) => sum + rankViolation(windows, answerWindow[key], key),
    0
  );

  return {
    windows,
    solutions,
    answerWindow,
    metrics: {
      candidateWindowCount: windows.length,
      solutionCount: solutions.length,
      nearMissCount: nearMisses.length,
      adjacentNearMissCount: adjacentNearMisses.length,
      firstPartialCandidateCount: firstPartial.length,
      secondPartialCandidateCount: secondPartial.length,
      typeLeftCount: typeLeft.length,
      typeRightCount: typeRight.length,
      distractorRegionCount: distractorRegions.size,
      sameAppleCount,
      samePearCount,
      sameOrangeCount,
      sameTotalCount,
      ...jointCueCounts,
      answerLargestOccupiedCluster: answerWindow.largestOccupiedCluster,
      occupiedCellCount: totalFruitCount,
      totalAppleCount: totals.apple,
      totalPearCount: totals.pear,
      totalOrangeCount: totals.orange,
      totalFruitCount,
      occupiedCellDensity,
      fruitLoadDensity: occupiedCellDensity,
      answerOccupiedCellDensity,
      answerFruitLoadDensity: answerOccupiedCellDensity,
      appleShare: totals.apple / totalFruitCount,
      pearShare: totals.pear / totalFruitCount,
      orangeShare: totals.orange / totalFruitCount,
      visualRankViolation,
      answerPatternViolationCount: answerPatternViolations(cells, answer),
      uniformLineViolationCount: countUniformLineViolations(cells),
    },
  };
}

export function validateNeumannProblem(problem, options = {}) {
  const errors = [];
  const profile = levelProfile(7);
  if (problem.level !== 7) errors.push("ノイマンのlevelは7でなければなりません");
  if (problem.levelLabel !== "ノイマン") errors.push("levelLabelがノイマンではありません");
  if (problem.mode !== "triple-order") errors.push("modeがtriple-orderではありません");
  if (problem.grid?.rows !== 10 || problem.grid?.cols !== 10 || problem.grid?.maxPerCell !== 1) {
    errors.push("ノイマンの盤面定義が不正です");
  }
  if (JSON.stringify(problem.grid?.cellStates) !== JSON.stringify(profile.cellStates)) {
    errors.push("ノイマンのセル状態が不正です");
  }
  if (
    problem.rule?.windowRows !== 3 ||
    problem.rule?.windowCols !== 3 ||
    JSON.stringify(problem.rule?.order) !== JSON.stringify(["apple", "pear", "orange"]) ||
    problem.rule?.comparison !== "strictly-increasing" ||
    problem.rule?.minimumEach !== 1
  ) {
    errors.push("ノイマンの問題条件が不正です");
  }

  const cells = problem.grid?.cells;
  if (!Array.isArray(cells) || cells.length !== 10 || cells.some((row) => !Array.isArray(row) || row.length !== 10)) {
    return { valid: false, errors: [...errors, "盤面は10×10でなければなりません"], metrics: null, solutions: [] };
  }
  for (const row of cells) {
    for (const value of row) if (![0, 1, 2, 3].includes(value)) errors.push(`許可されていないセル値です: ${value}`);
  }
  const answer = problem.answer;
  if (!Number.isInteger(answer?.row) || !Number.isInteger(answer?.col) || answer.row < 0 || answer.row > 7 || answer.col < 0 || answer.col > 7) {
    return { valid: false, errors: [...errors, "正解枠が盤面内に収まりません"], metrics: null, solutions: [] };
  }

  const analysis = analyzeNeumannProblem(problem);
  const metrics = analysis.metrics;
  if (analysis.solutions.length !== 1) errors.push(`正解枠が${analysis.solutions.length}か所あります`);
  if (analysis.solutions.length === 1 && (analysis.solutions[0].row !== answer.row || analysis.solutions[0].col !== answer.col)) {
    errors.push("唯一の正解枠とanswer座標が一致しません");
  }
  if (!ANSWER_TRIPLES.has(`${analysis.answerWindow.appleCount},${analysis.answerWindow.pearCount},${analysis.answerWindow.orangeCount}`)) {
    errors.push("正解枠の個数三つ組が許可範囲外です");
  }
  if (metrics.firstPartialCandidateCount < 8 || metrics.secondPartialCandidateCount < 8) errors.push("部分条件だけで候補が絞れすぎます");
  if (metrics.typeLeftCount < 3 || metrics.typeRightCount < 3) errors.push("認知的な紛らわしさが不足しています");
  if (metrics.distractorRegionCount < 3) errors.push("紛らわしい枠の空間分布が不足しています");
  if (Math.min(metrics.sameAppleCount, metrics.samePearCount, metrics.sameOrangeCount, metrics.sameTotalCount) < 5) {
    errors.push("一つの数え方だけで正解位置が漏れます");
  }
  if (JOINT_CUES.some(([metric]) => metrics[metric] < profile.requiredJointCueCount)) {
    errors.push("二つの手掛かりの組み合わせで正解位置が漏れます");
  }
  if (metrics.visualRankViolation > EPSILON) errors.push("正解枠の個数が経験分布の端にあります");
  if (metrics.answerPatternViolationCount !== 0) errors.push("正解枠に禁止された見た目があります");
  if (!inRange(metrics.occupiedCellDensity, 0.45, 0.7)) errors.push("占有密度が範囲外です");
  if (![metrics.appleShare, metrics.pearShare, metrics.orangeShare].every((value) => inRange(value, 0.2, 0.45))) {
    errors.push("図柄比率が範囲外です");
  }
  if (Math.abs(metrics.answerOccupiedCellDensity - metrics.occupiedCellDensity) > 0.25 + EPSILON) {
    errors.push("正解枠と盤面の占有密度差が大きすぎます");
  }
  if (metrics.uniformLineViolationCount !== 0) errors.push("一様な行または列が連続しています");

  if (options.compareMetrics !== false && problem.metrics) {
    for (const [key, value] of Object.entries(metrics)) {
      if (!sameMetric(problem.metrics[key], value)) errors.push(`metrics.${key}が再計算値と一致しません`);
    }
  }
  return { valid: errors.length === 0, errors, metrics, solutions: analysis.solutions };
}

export function distanceNeumann({ emptyCount, appleCount, pearCount, orangeCount }) {
  const source = [emptyCount, appleCount, pearCount, orangeCount];
  let best = 9;
  for (const target of DISTANCE_TARGETS) {
    const kept = source.reduce((sum, count, index) => sum + Math.min(count, target[index]), 0);
    best = Math.min(best, 9 - kept);
  }
  return best;
}

function countWindow(cells, row, col) {
  const counts = [0, 0, 0, 0];
  const occupied = Array.from({ length: 3 }, () => Array(3).fill(false));
  for (let dy = 0; dy < 3; dy += 1) {
    for (let dx = 0; dx < 3; dx += 1) {
      const value = cells[row + dy][col + dx];
      counts[value] += 1;
      occupied[dy][dx] = value !== 0;
    }
  }
  return {
    emptyCount: counts[0],
    appleCount: counts[1],
    pearCount: counts[2],
    orangeCount: counts[3],
    totalFruitCount: 9 - counts[0],
    largestOccupiedCluster: largestOccupiedCluster(occupied),
  };
}

function largestOccupiedCluster(occupied) {
  const seen = new Set();
  let largest = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const start = row * 3 + col;
      if (!occupied[row][col] || seen.has(start)) continue;
      const stack = [start];
      seen.add(start);
      let size = 0;
      while (stack.length) {
        const current = stack.pop();
        size += 1;
        const currentRow = Math.floor(current / 3);
        const currentCol = current % 3;
        for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nextRow = currentRow + dy;
          const nextCol = currentCol + dx;
          const next = nextRow * 3 + nextCol;
          if (
            nextRow >= 0 && nextRow < 3 && nextCol >= 0 && nextCol < 3 &&
            occupied[nextRow][nextCol] && !seen.has(next)
          ) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
      largest = Math.max(largest, size);
    }
  }
  return largest;
}

function matchesRule(window) {
  return window.appleCount >= 1 && window.appleCount < window.pearCount && window.pearCount < window.orangeCount;
}

function boardTotals(cells) {
  const totals = { apple: 0, pear: 0, orange: 0 };
  for (const row of cells) {
    for (const value of row) {
      if (value === 1) totals.apple += 1;
      if (value === 2) totals.pear += 1;
      if (value === 3) totals.orange += 1;
    }
  }
  return totals;
}

function rankViolation(windows, value, key) {
  const lower = windows.filter((window) => window[key] < value).length / 64;
  const upper = windows.filter((window) => window[key] > value).length / 64;
  return Math.max(0, lower - 0.9) + Math.max(0, upper - 0.9);
}

function answerPatternViolations(cells, answer) {
  const local = Array.from({ length: 3 }, (_, row) => cells[answer.row + row].slice(answer.col, answer.col + 3));
  let violations = local.flat().every((value) => value !== 0) ? 1 : 0;
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const value = local[row][col];
      if (value !== 0 && value === local[row + 1][col] && value === local[row][col + 1] && value === local[row + 1][col + 1]) violations += 1;
    }
  }
  const seen = new Set();
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const value = local[row][col];
      const key = row * 3 + col;
      if (value === 0 || seen.has(key)) continue;
      const stack = [key];
      seen.add(key);
      let size = 0;
      while (stack.length) {
        const current = stack.pop();
        size += 1;
        const y = Math.floor(current / 3);
        const x = current % 3;
        for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const ny = y + dy;
          const nx = x + dx;
          const next = ny * 3 + nx;
          if (ny >= 0 && ny < 3 && nx >= 0 && nx < 3 && !seen.has(next) && local[ny][nx] === value) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
      if (size >= 4) violations += 1;
    }
  }
  return violations;
}

function countUniformLineViolations(cells) {
  const kinds = (lines) => lines.map((line) => line.every((value) => value === 0) ? "empty" : line.every((value) => value !== 0) ? "filled" : "mixed");
  const rows = kinds(cells);
  const cols = kinds(Array.from({ length: 10 }, (_, col) => cells.map((row) => row[col])));
  return countAdjacent(rows) + countAdjacent(cols);
}

function countAdjacent(kinds) {
  let count = 0;
  for (let index = 1; index < kinds.length; index += 1) {
    if (kinds[index] !== "mixed" && kinds[index] === kinds[index - 1]) count += 1;
  }
  return count;
}

function validHistograms() {
  const targets = [];
  for (let empty = 0; empty <= 9; empty += 1) {
    for (let apple = 1; apple <= 9 - empty; apple += 1) {
      for (let pear = apple + 1; pear <= 9 - empty - apple; pear += 1) {
        const orange = 9 - empty - apple - pear;
        if (pear < orange) targets.push([empty, apple, pear, orange]);
      }
    }
  }
  return targets;
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
