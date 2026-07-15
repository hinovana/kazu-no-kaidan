import { evaluateNeumannVisualSalience } from "./visual-salience.js?v=1";

const COST_MODEL = Object.freeze({
  windowCheck: 1,
  fruitCount: 1,
  comparison: 1,
  cellObservation: 1 / 9,
});

const FRUIT_KINDS = Object.freeze({
  "single-exact": ["apple"],
  "stacked-single-exact": ["apple"],
  "pair-exact": ["apple", "pear"],
  "pair-relation": ["apple", "pear"],
  "triple-order": ["apple", "pear", "orange"],
});

export function evaluateProblemDifficulty(problem) {
  const view = solverView(problem);
  const windows = enumerateWindows(view);
  const solutions = windows.filter((window) => matchesRule(view, window));
  if (solutions.length !== 1) {
    throw new Error(`難易度評価には一意解が必要です（${solutions.length}解）`);
  }

  const solution = solutions[0];
  const visualSolvers = evaluateVisualHeuristics(view, windows, solution);
  const solvers = [
    evaluateRasterFull(view, windows, solution),
    evaluateSlidingFull(view, windows, solution),
    ...evaluateConditionFirst(view, windows, solution),
    ...visualSolvers,
  ];
  const best = [...solvers].sort(
    (left, right) => left.expectedCost - right.expectedCost || left.expectedRank - right.expectedRank || left.id.localeCompare(right.id)
  )[0];

  return {
    level: problem.level,
    levelLabel: problem.levelLabel || String(problem.level),
    problemId: problem.problemId,
    mode: view.mode,
    candidateWindowCount: windows.length,
    solution: { row: solution.row, col: solution.col },
    bestSolverId: best.id,
    bestSolverLabel: best.label,
    bestExpectedCost: best.expectedCost,
    bestExpectedRank: best.expectedRank,
    visualExpectedRank: Math.min(...visualSolvers.map((solver) => solver.expectedRank)),
    solvers,
  };
}

export function summarizeLevel(records) {
  if (records.length === 0) return null;
  const costs = records.map((record) => record.bestExpectedCost).sort(numericSort);
  const ranks = records.map((record) => record.bestExpectedRank).sort(numericSort);
  const visualRanks = records.map((record) => record.visualExpectedRank);
  const generationTimes = records.map((record) => record.generationMs).filter(Number.isFinite).sort(numericSort);
  const winners = new Map();
  for (const record of records) winners.set(record.bestSolverLabel, (winners.get(record.bestSolverLabel) || 0) + 1);
  const [winnerLabel, winnerCount] = [...winners.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return {
    level: records[0].level,
    levelLabel: records[0].levelLabel,
    sampleCount: records.length,
    costP10: quantile(costs, 0.1),
    costMedian: quantile(costs, 0.5),
    costP90: quantile(costs, 0.9),
    rankMedian: quantile(ranks, 0.5),
    visualRank1Rate: visualRanks.filter((rank) => rank <= 1).length / records.length,
    visualRank2Rate: visualRanks.filter((rank) => rank <= 2).length / records.length,
    generationP95Ms: generationTimes.length ? quantile(generationTimes, 0.95) : null,
    winnerLabel,
    winnerRate: winnerCount / records.length,
  };
}

export function probabilityGreater(leftValues, rightValues) {
  if (leftValues.length === 0 || rightValues.length === 0) return null;
  const right = [...rightValues].sort(numericSort);
  let wins = 0;
  let ties = 0;
  for (const value of leftValues) {
    const below = lowerBound(right, value);
    const atMost = upperBound(right, value);
    wins += below;
    ties += atMost - below;
  }
  return { greater: wins / (leftValues.length * right.length), tied: ties / (leftValues.length * right.length) };
}

export function quantile(sortedValues, probability) {
  if (sortedValues.length === 0) return null;
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

function solverView(problem) {
  return {
    mode: problem.mode,
    rule: structuredClone(problem.rule),
    rows: problem.grid.rows,
    cols: problem.grid.cols,
    cells: problem.grid.cells.map((row) => [...row]),
  };
}

function enumerateWindows(view) {
  const windows = [];
  for (let row = 0; row <= view.rows - 3; row += 1) {
    for (let col = 0; col <= view.cols - 3; col += 1) {
      const counts = { empty: 0, apple: 0, pear: 0, orange: 0 };
      const occupied = Array.from({ length: 3 }, () => Array(3).fill(false));
      for (let dy = 0; dy < 3; dy += 1) {
        for (let dx = 0; dx < 3; dx += 1) {
          const value = view.cells[row + dy][col + dx];
          if (view.mode === "single-exact" || view.mode === "stacked-single-exact") {
            counts.apple += value;
            counts.empty += value === 0 ? 1 : 0;
            occupied[dy][dx] = value > 0;
          } else {
            counts.empty += value === 0 ? 1 : 0;
            counts.apple += value === 1 ? 1 : 0;
            counts.pear += value === 2 ? 1 : 0;
            counts.orange += value === 3 ? 1 : 0;
            occupied[dy][dx] = value !== 0;
          }
        }
      }
      windows.push({
        row,
        col,
        ...counts,
        total: counts.apple + counts.pear + counts.orange,
        cluster: largestCluster(occupied),
      });
    }
  }
  return windows;
}

function matchesRule(view, window) {
  if (view.mode === "single-exact" || view.mode === "stacked-single-exact") {
    return window.apple === view.rule.targetApple;
  }
  if (view.mode === "pair-exact") {
    return window.apple === view.rule.targetApple && window.pear === view.rule.targetPear;
  }
  if (view.mode === "pair-relation") {
    if (view.rule.relation === "equal") return window.apple === window.pear;
    return window.apple < window.pear;
  }
  return window.apple >= 1 && window.apple < window.pear && window.pear < window.orange;
}

function evaluateRasterFull(view, windows, solution) {
  const rank = windows.findIndex(samePosition(solution)) + 1;
  const perWindow = fullWindowOperations(view.mode, 9);
  return solverResult("raster-full", "左上から全部数える", rank, rank, rank, scaleOperations(perWindow, rank));
}

function evaluateSlidingFull(view, windows, solution) {
  const order = serpentineOrder(windows);
  const rank = order.findIndex(samePosition(solution)) + 1;
  const kinds = FRUIT_KINDS[view.mode].length;
  const comparisons = comparisonCount(view.mode);
  const operations = {
    windowsChecked: rank,
    cellObservations: 9 + Math.max(0, rank - 1) * 3,
    fruitCountOps: rank * kinds,
    comparisons: rank * comparisons,
    recounts: 0,
  };
  return solverResult("sliding-update", "差分で枠をずらす", rank, rank, rank, operations);
}

function evaluateConditionFirst(view, windows, solution) {
  if (view.mode === "pair-exact") {
    return [
      evaluateShortCircuit(view, windows, solution, "apple", "リンゴから数える"),
      evaluateShortCircuit(view, windows, solution, "pear", "ナシから数える"),
    ];
  }
  if (view.mode === "triple-order") {
    return [
      evaluateShortCircuit(view, windows, solution, "apple-pear", "リンゴ＜ナシから確かめる"),
      evaluateShortCircuit(view, windows, solution, "pear-orange", "ナシ＜ミカンから確かめる"),
    ];
  }
  return [];
}

function evaluateShortCircuit(view, windows, solution, first, label) {
  const operations = emptyOperations();
  let rank = 0;
  for (const window of windows) {
    rank += 1;
    operations.windowsChecked += 1;
    operations.cellObservations += 9;
    if (view.mode === "pair-exact") {
      const targetKey = first === "apple" ? "targetApple" : "targetPear";
      operations.fruitCountOps += 1;
      operations.comparisons += 1;
      if (window[first] === view.rule[targetKey]) {
        operations.fruitCountOps += 1;
        operations.comparisons += 1;
      }
    } else {
      const passesFirst = first === "apple-pear"
        ? window.apple >= 1 && window.apple < window.pear
        : window.pear >= 1 && window.pear < window.orange;
      operations.fruitCountOps += 2;
      operations.comparisons += 1;
      if (passesFirst) {
        operations.fruitCountOps += 1;
        operations.comparisons += 1;
      }
    }
    if (samePosition(solution)(window)) break;
  }
  return solverResult(`condition-${first}`, label, rank, rank, rank, operations);
}

function evaluateVisualHeuristics(view, windows, solution) {
  if (view.mode === "triple-order") {
    const salience = evaluateNeumannVisualSalience(windows, solution);
    return salience.ranks.map((rank) => {
      const operations = scaleOperations(fullWindowOperations(view.mode, 9), rank.expectedRank);
      operations.recounts = Math.max(0, rank.expectedRank - 1);
      return solverResult(`visual-${rank.id}`, `見た目: ${rank.label}`, rank.bestRank, rank.expectedRank, rank.worstRank, operations);
    });
  }

  const scored = windows.map((window) => ({ window, score: visualScore(view, window) }));
  const solutionScore = scored.find(({ window }) => samePosition(solution)(window)).score;
  const better = scored.filter(({ score }) => score > solutionScore).length;
  const tied = scored.filter(({ score }) => score === solutionScore).length;
  const bestRank = better + 1;
  const worstRank = better + tied;
  const expectedRank = better + (tied + 1) / 2;
  const operations = scaleOperations(fullWindowOperations(view.mode, 9), expectedRank);
  operations.recounts = Math.max(0, expectedRank - 1);
  return [solverResult("visual-heuristic", "見た目の目立ち方から当たる", bestRank, expectedRank, worstRank, operations)];
}

function visualScore(view, window) {
  if (view.mode === "single-exact" || view.mode === "stacked-single-exact") {
    return -Math.abs(coarseCount(window.apple) - coarseCount(view.rule.targetApple)) * 10
      + coarseCluster(window.cluster);
  }
  if (view.mode === "pair-exact") {
    return -(
      Math.abs(coarseCount(window.apple) - coarseCount(view.rule.targetApple))
      + Math.abs(coarseCount(window.pear) - coarseCount(view.rule.targetPear))
    ) * 10 + coarseCluster(window.cluster);
  }
  if (view.mode === "pair-relation") {
    const relationFit = view.rule.relation === "equal"
      ? -Math.min(2, Math.floor(Math.abs(window.apple - window.pear) / 2))
      : Number(window.pear >= window.apple);
    const bothPresent = window.apple >= 1 && window.pear >= 1 ? 1 : 0;
    return relationFit * 10 + bothPresent * 2 + coarseCluster(window.cluster);
  }
  throw new RangeError(`未対応の見た目評価モードです: ${view.mode}`);
}

function coarseCount(value) {
  return Math.floor(value / 2);
}

function coarseCluster(value) {
  if (value <= 2) return 0;
  if (value <= 5) return 1;
  return 2;
}

function fullWindowOperations(mode, cellObservations) {
  return {
    windowsChecked: 1,
    cellObservations,
    fruitCountOps: FRUIT_KINDS[mode].length,
    comparisons: comparisonCount(mode),
    recounts: 0,
  };
}

function comparisonCount(mode) {
  if (mode === "triple-order") return 2;
  if (mode === "pair-exact") return 2;
  return 1;
}

function solverResult(id, label, bestRank, expectedRank, worstRank, operations) {
  return {
    id,
    label,
    bestRank,
    expectedRank,
    worstRank,
    operations,
    expectedCost: operationCost(operations),
  };
}

function operationCost(operations) {
  return operations.windowsChecked * COST_MODEL.windowCheck
    + operations.fruitCountOps * COST_MODEL.fruitCount
    + operations.comparisons * COST_MODEL.comparison
    + operations.cellObservations * COST_MODEL.cellObservation;
}

function scaleOperations(operations, multiplier) {
  return Object.fromEntries(Object.entries(operations).map(([key, value]) => [key, value * multiplier]));
}

function emptyOperations() {
  return { windowsChecked: 0, cellObservations: 0, fruitCountOps: 0, comparisons: 0, recounts: 0 };
}

function serpentineOrder(windows) {
  return [...windows].sort((left, right) => {
    if (left.row !== right.row) return left.row - right.row;
    return left.row % 2 === 0 ? left.col - right.col : right.col - left.col;
  });
}

function largestCluster(occupied) {
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
          if (nextRow >= 0 && nextRow < 3 && nextCol >= 0 && nextCol < 3 && occupied[nextRow][nextCol] && !seen.has(next)) {
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

function samePosition(target) {
  return (window) => window.row === target.row && window.col === target.col;
}

function lowerBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function numericSort(left, right) {
  return left - right;
}

export { COST_MODEL };
