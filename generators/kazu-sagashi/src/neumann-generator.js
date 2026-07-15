import { validateNeumannProblem } from "./neumann-validator.js?v=2";

const EPSILON = 1e-12;
const patternCache = new Map();
const occupiedClusterCache = new Array(512);
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

export function buildNeumannProblem(profile, normalizedSeed, questionIndex, variantIndex, generatorVersion) {
  const problemSeed = [generatorVersion, profile.level, normalizedSeed, questionIndex, variantIndex].join("\0");
  const problemRng = new Rng(problemSeed);
  const answer = { row: problemRng.int(0, 7), col: problemRng.int(0, 7) };
  const answerTriple = [...problemRng.choice(profile.answerTriples)];
  const answerPattern = [...problemRng.choice(answerPatterns(answerTriple))];
  let totalRepairSteps = 0;

  for (let restartIndex = 0; restartIndex < profile.maxRestarts; restartIndex += 1) {
    const rng = new Rng(`${problemSeed}\0restart\0${restartIndex}`);
    const cells = initialBoard(profile, answer, answerPattern, rng);
    const tabu = new Map();
    let bestScore = null;
    let stagnationCount = 0;

    for (let step = 0; step <= profile.maxRepairStepsPerRestart; step += 1) {
      const analysis = analyzeBoard(cells, answer);
      const score = scoreAnalysis(analysis, profile);
      if (isAcceptable(analysis, profile, answer, answerTriple)) {
        const problem = makeProblem({
          profile,
          normalizedSeed,
          questionIndex,
          variantIndex,
          generatorVersion,
          answer,
          answerTriple,
          cells,
          analysis,
          restartIndex,
          repairStepCount: totalRepairSteps,
        });
        const validation = validateNeumannProblem(problem);
        if (!validation.valid) {
          const error = new Error("独立バリデータがノイマン生成結果を拒否しました");
          error.name = "GenerationError";
          error.details = { level: 7, errors: validation.errors };
          throw error;
        }
        return problem;
      }
      if (step === profile.maxRepairStepsPerRestart) break;

      const moves = candidateMoves(cells, answer, analysis, profile, rng);
      let bestMoveScore = null;
      const bestMoves = [];
      for (const move of moves) {
        const key = moveKey(move.row, move.col, move.oldValue, move.newValue);
        if ((tabu.get(key) ?? -1) > step) continue;
        cells[move.row][move.col] = move.newValue;
        const moveScore = scoreAnalysis(analyzeBoard(cells, answer), profile);
        cells[move.row][move.col] = move.oldValue;
        const comparison = bestMoveScore === null ? -1 : compareScores(moveScore, bestMoveScore);
        if (comparison < 0) {
          bestMoveScore = moveScore;
          bestMoves.length = 0;
          bestMoves.push(move);
        } else if (comparison === 0) {
          bestMoves.push(move);
        }
      }
      if (bestMoves.length === 0) break;
      const move = rng.choice(bestMoves);
      cells[move.row][move.col] = move.newValue;
      tabu.set(moveKey(move.row, move.col, move.newValue, move.oldValue), step + profile.tabuLength + 1);
      totalRepairSteps += 1;

      if (bestScore === null || compareScores(bestMoveScore, bestScore) < 0) {
        bestScore = bestMoveScore;
        stagnationCount = 0;
      } else {
        stagnationCount += 1;
      }
      if (stagnationCount >= profile.stagnationLimit) break;
    }
  }

  const error = new Error("レベル: ノイマンの全品質条件を満たす問題を生成できませんでした");
  error.name = "GenerationError";
  error.details = { level: 7, seed: normalizedSeed, questionIndex, variantIndex, answerTriple };
  throw error;
}

function initialBoard(profile, answer, answerPattern, rng) {
  const cells = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => weightedValue(profile, rng)));
  for (let index = 0; index < 9; index += 1) cells[answer.row + Math.floor(index / 3)][answer.col + (index % 3)] = answerPattern[index];
  return cells;
}

function answerPatterns([apple, pear, orange]) {
  const key = `${apple},${pear},${orange}`;
  if (patternCache.has(key)) return patternCache.get(key);
  const counts = [9 - apple - pear - orange, apple, pear, orange];
  const current = Array(9).fill(0);
  const patterns = [];
  const visit = (index) => {
    if (index === 9) {
      if (answerPatternViolations(current) === 0) patterns.push([...current]);
      return;
    }
    for (let value = 0; value < counts.length; value += 1) {
      if (counts[value] === 0) continue;
      counts[value] -= 1;
      current[index] = value;
      visit(index + 1);
      counts[value] += 1;
    }
  };
  visit(0);
  patternCache.set(key, patterns);
  return patterns;
}

function analyzeBoard(cells, answer) {
  const windows = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) windows.push({ row, col, ...countWindow(cells, row, col) });
  }
  const solutions = windows.filter(matchesRule);
  const competitors = solutions.filter((window) => window.row !== answer.row || window.col !== answer.col);
  const firstPartial = windows.filter((window) => window.appleCount >= 1 && window.appleCount < window.pearCount);
  const secondPartial = windows.filter((window) => window.pearCount < window.orangeCount);
  const typeLeft = windows.filter(
    (window) => !matchesRule(window) && window.appleCount >= 1 && window.appleCount < window.pearCount && window.pearCount >= window.orangeCount && window.pearCount - window.orangeCount <= 1
  );
  const typeRight = windows.filter(
    (window) => !matchesRule(window) && window.appleCount >= window.pearCount && window.pearCount < window.orangeCount && window.appleCount - window.pearCount <= 1 && window.pearCount >= 1
  );
  const regions = new Set([...typeLeft, ...typeRight].map((window) => `${Math.floor(window.row / 4)},${Math.floor(window.col / 4)}`));
  const answerWindow = windows.find((window) => window.row === answer.row && window.col === answer.col);
  const same = (key) => windows.filter((window) => window[key] === answerWindow[key]).length;
  const jointCueCounts = Object.fromEntries(
    JOINT_CUES.map(([metric, first, second]) => [
      metric,
      windows.filter((window) => window[first] === answerWindow[first] && window[second] === answerWindow[second]).length,
    ])
  );
  const totals = boardTotals(cells);
  const totalFruitCount = totals.apple + totals.pear + totals.orange;
  const occupiedCellDensity = totalFruitCount / 100;
  const nearMisses = windows.filter((window) => distanceNeumann(window) === 1);
  return {
    windows,
    solutions,
    competitors,
    answerWindow,
    nearMissCount: nearMisses.length,
    adjacentNearMissCount: nearMisses.filter((window) => Math.max(Math.abs(window.row - answer.row), Math.abs(window.col - answer.col)) === 1).length,
    firstPartialCandidateCount: firstPartial.length,
    secondPartialCandidateCount: secondPartial.length,
    typeLeftCount: typeLeft.length,
    typeRightCount: typeRight.length,
    distractorRegionCount: regions.size,
    sameAppleCount: same("appleCount"),
    samePearCount: same("pearCount"),
    sameOrangeCount: same("orangeCount"),
    sameTotalCount: same("totalFruitCount"),
    ...jointCueCounts,
    answerLargestOccupiedCluster: answerWindow.largestOccupiedCluster,
    totalAppleCount: totals.apple,
    totalPearCount: totals.pear,
    totalOrangeCount: totals.orange,
    totalFruitCount,
    occupiedCellDensity,
    answerOccupiedCellDensity: answerWindow.totalFruitCount / 9,
    appleShare: totals.apple / totalFruitCount,
    pearShare: totals.pear / totalFruitCount,
    orangeShare: totals.orange / totalFruitCount,
    visualRankViolation: ["appleCount", "pearCount", "orangeCount", "totalFruitCount"].reduce(
      (sum, key) => sum + rankViolation(windows, answerWindow[key], key), 0
    ),
    answerPatternViolationCount: answerPatternViolations(extractAnswer(cells, answer)),
    uniformLineViolationCount: countUniformLineViolations(cells),
  };
}

function scoreAnalysis(analysis, profile) {
  return [
    analysis.competitors.length,
    Math.max(0, profile.requiredPartialCandidateCount - analysis.firstPartialCandidateCount) + Math.max(0, profile.requiredPartialCandidateCount - analysis.secondPartialCandidateCount),
    Math.max(0, profile.requiredDistractorCount - analysis.typeLeftCount) + Math.max(0, profile.requiredDistractorCount - analysis.typeRightCount),
    Math.max(0, profile.requiredSameCount - analysis.sameAppleCount) + Math.max(0, profile.requiredSameCount - analysis.samePearCount) + Math.max(0, profile.requiredSameCount - analysis.sameOrangeCount) + Math.max(0, profile.requiredSameCount - analysis.sameTotalCount),
    jointCueShortfall(analysis, profile.requiredJointCueCount),
    Math.max(0, profile.requiredDistractorRegions - analysis.distractorRegionCount),
    analysis.visualRankViolation,
    rangeViolation(analysis.occupiedCellDensity, 0.45, 0.7) + rangeViolation(analysis.appleShare, 0.2, 0.45) + rangeViolation(analysis.pearShare, 0.2, 0.45) + rangeViolation(analysis.orangeShare, 0.2, 0.45) + Math.max(0, Math.abs(analysis.answerOccupiedCellDensity - analysis.occupiedCellDensity) - 0.25),
    analysis.uniformLineViolationCount,
  ];
}

function isAcceptable(analysis, profile, answer, answerTriple) {
  const actual = analysis.answerWindow;
  return (
    analysis.solutions.length === 1 &&
    analysis.solutions[0].row === answer.row &&
    analysis.solutions[0].col === answer.col &&
    actual.appleCount === answerTriple[0] && actual.pearCount === answerTriple[1] && actual.orangeCount === answerTriple[2] &&
    analysis.firstPartialCandidateCount >= profile.requiredPartialCandidateCount &&
    analysis.secondPartialCandidateCount >= profile.requiredPartialCandidateCount &&
    analysis.typeLeftCount >= profile.requiredDistractorCount &&
    analysis.typeRightCount >= profile.requiredDistractorCount &&
    analysis.distractorRegionCount >= profile.requiredDistractorRegions &&
    Math.min(analysis.sameAppleCount, analysis.samePearCount, analysis.sameOrangeCount, analysis.sameTotalCount) >= profile.requiredSameCount &&
    jointCueShortfall(analysis, profile.requiredJointCueCount) === 0 &&
    analysis.visualRankViolation <= EPSILON &&
    analysis.answerPatternViolationCount === 0 &&
    inRange(analysis.occupiedCellDensity, 0.45, 0.7) &&
    [analysis.appleShare, analysis.pearShare, analysis.orangeShare].every((value) => inRange(value, 0.2, 0.45)) &&
    Math.abs(analysis.answerOccupiedCellDensity - analysis.occupiedCellDensity) <= 0.25 + EPSILON &&
    analysis.uniformLineViolationCount === 0
  );
}

function candidateMoves(cells, answer, analysis, profile, rng) {
  const answerCells = new Set();
  for (let dy = 0; dy < 3; dy += 1) for (let dx = 0; dx < 3; dx += 1) answerCells.add((answer.row + dy) * 10 + answer.col + dx);
  const eligible = new Set();
  if (analysis.competitors.length) {
    for (const window of analysis.competitors) {
      for (let dy = 0; dy < 3; dy += 1) for (let dx = 0; dx < 3; dx += 1) {
        const key = (window.row + dy) * 10 + window.col + dx;
        if (!answerCells.has(key)) eligible.add(key);
      }
    }
  } else {
    for (let key = 0; key < 100; key += 1) if (!answerCells.has(key)) eligible.add(key);
  }
  const moves = [];
  for (const key of [...eligible].sort((a, b) => a - b)) {
    const row = Math.floor(key / 10);
    const col = key % 10;
    const oldValue = cells[row][col];
    for (const newValue of profile.cellValues) if (newValue !== oldValue) moves.push({ row, col, oldValue, newValue });
  }
  if (analysis.competitors.length || moves.length <= profile.maxQualityMovesPerStep) return moves;
  for (let index = 0; index < profile.maxQualityMovesPerStep; index += 1) {
    const selected = rng.int(index, moves.length - 1);
    [moves[index], moves[selected]] = [moves[selected], moves[index]];
  }
  return moves.slice(0, profile.maxQualityMovesPerStep);
}

function makeProblem({ profile, normalizedSeed, questionIndex, variantIndex, generatorVersion, answer, answerTriple, cells, analysis, restartIndex, repairStepCount }) {
  const identity = [generatorVersion, 7, normalizedSeed, questionIndex, variantIndex].join("\0");
  return {
    schemaVersion: 1,
    generatorVersion,
    problemId: `KS-N-${fnv1a(identity).toString(36).toUpperCase().padStart(7, "0").slice(0, 7)}`,
    level: 7,
    levelLabel: "ノイマン",
    mode: "triple-order",
    seed: normalizedSeed,
    questionIndex,
    variantIndex,
    grid: { rows: 10, cols: 10, maxPerCell: 1, cellStates: [...profile.cellStates], cells: cells.map((row) => [...row]) },
    rule: { windowRows: 3, windowCols: 3, order: ["apple", "pear", "orange"], comparison: "strictly-increasing", minimumEach: 1 },
    answer: { ...answer },
    answerTriple: [...answerTriple],
    metrics: {
      candidateWindowCount: 64,
      solutionCount: 1,
      nearMissCount: analysis.nearMissCount,
      adjacentNearMissCount: analysis.adjacentNearMissCount,
      firstPartialCandidateCount: analysis.firstPartialCandidateCount,
      secondPartialCandidateCount: analysis.secondPartialCandidateCount,
      typeLeftCount: analysis.typeLeftCount,
      typeRightCount: analysis.typeRightCount,
      distractorRegionCount: analysis.distractorRegionCount,
      sameAppleCount: analysis.sameAppleCount,
      samePearCount: analysis.samePearCount,
      sameOrangeCount: analysis.sameOrangeCount,
      sameTotalCount: analysis.sameTotalCount,
      sameApplePearCount: analysis.sameApplePearCount,
      sameAppleOrangeCount: analysis.sameAppleOrangeCount,
      samePearOrangeCount: analysis.samePearOrangeCount,
      sameAppleTotalCount: analysis.sameAppleTotalCount,
      samePearTotalCount: analysis.samePearTotalCount,
      sameOrangeTotalCount: analysis.sameOrangeTotalCount,
      sameAppleClusterCount: analysis.sameAppleClusterCount,
      samePearClusterCount: analysis.samePearClusterCount,
      sameOrangeClusterCount: analysis.sameOrangeClusterCount,
      sameTotalClusterCount: analysis.sameTotalClusterCount,
      answerLargestOccupiedCluster: analysis.answerLargestOccupiedCluster,
      occupiedCellCount: analysis.totalFruitCount,
      totalAppleCount: analysis.totalAppleCount,
      totalPearCount: analysis.totalPearCount,
      totalOrangeCount: analysis.totalOrangeCount,
      totalFruitCount: analysis.totalFruitCount,
      occupiedCellDensity: analysis.occupiedCellDensity,
      fruitLoadDensity: analysis.occupiedCellDensity,
      answerOccupiedCellDensity: analysis.answerOccupiedCellDensity,
      answerFruitLoadDensity: analysis.answerOccupiedCellDensity,
      appleShare: analysis.appleShare,
      pearShare: analysis.pearShare,
      orangeShare: analysis.orangeShare,
      visualRankViolation: analysis.visualRankViolation,
      answerPatternViolationCount: analysis.answerPatternViolationCount,
      uniformLineViolationCount: analysis.uniformLineViolationCount,
      restartCount: restartIndex,
      repairStepCount,
    },
  };
}

function countWindow(cells, row, col) {
  const counts = [0, 0, 0, 0];
  let occupiedMask = 0;
  for (let dy = 0; dy < 3; dy += 1) for (let dx = 0; dx < 3; dx += 1) {
    const value = cells[row + dy][col + dx];
    counts[value] += 1;
    if (value !== 0) occupiedMask |= 1 << (dy * 3 + dx);
  }
  return {
    emptyCount: counts[0],
    appleCount: counts[1],
    pearCount: counts[2],
    orangeCount: counts[3],
    totalFruitCount: 9 - counts[0],
    largestOccupiedCluster: largestOccupiedCluster(occupiedMask),
  };
}

function largestOccupiedCluster(mask) {
  if (occupiedClusterCache[mask] !== undefined) return occupiedClusterCache[mask];
  let unseen = mask;
  let largest = 0;
  while (unseen !== 0) {
    const startBit = unseen & -unseen;
    const start = 31 - Math.clz32(startBit);
    const stack = [start];
    unseen &= ~startBit;
    let size = 0;
    while (stack.length) {
      const current = stack.pop();
      size += 1;
      const row = Math.floor(current / 3);
      const col = current % 3;
      for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nextRow = row + dy;
        const nextCol = col + dx;
        if (nextRow < 0 || nextRow >= 3 || nextCol < 0 || nextCol >= 3) continue;
        const next = nextRow * 3 + nextCol;
        const nextBit = 1 << next;
        if ((unseen & nextBit) !== 0) {
          unseen &= ~nextBit;
          stack.push(next);
        }
      }
    }
    largest = Math.max(largest, size);
  }
  occupiedClusterCache[mask] = largest;
  return largest;
}

function jointCueShortfall(analysis, requiredCount) {
  return JOINT_CUES.reduce((sum, [metric]) => sum + Math.max(0, requiredCount - analysis[metric]), 0);
}

function matchesRule(window) { return window.appleCount >= 1 && window.appleCount < window.pearCount && window.pearCount < window.orangeCount; }

function distanceNeumann(source) {
  let best = 9;
  for (let empty = 0; empty <= 9; empty += 1) for (let apple = 1; apple <= 9 - empty; apple += 1) for (let pear = apple + 1; pear <= 9 - empty - apple; pear += 1) {
    const orange = 9 - empty - apple - pear;
    if (pear >= orange) continue;
    const target = [empty, apple, pear, orange];
    const actual = [source.emptyCount, source.appleCount, source.pearCount, source.orangeCount];
    best = Math.min(best, 9 - actual.reduce((sum, count, index) => sum + Math.min(count, target[index]), 0));
  }
  return best;
}

function boardTotals(cells) {
  const result = { apple: 0, pear: 0, orange: 0 };
  for (const row of cells) for (const value of row) {
    if (value === 1) result.apple += 1;
    if (value === 2) result.pear += 1;
    if (value === 3) result.orange += 1;
  }
  return result;
}

function rankViolation(windows, value, key) {
  return Math.max(0, windows.filter((window) => window[key] < value).length / 64 - 0.9) + Math.max(0, windows.filter((window) => window[key] > value).length / 64 - 0.9);
}

function extractAnswer(cells, answer) { return Array.from({ length: 9 }, (_, index) => cells[answer.row + Math.floor(index / 3)][answer.col + (index % 3)]); }

function answerPatternViolations(values) {
  const local = Array.isArray(values[0]) ? values : Array.from({ length: 3 }, (_, row) => values.slice(row * 3, row * 3 + 3));
  let violations = local.flat().every((value) => value !== 0) ? 1 : 0;
  for (let row = 0; row < 2; row += 1) for (let col = 0; col < 2; col += 1) {
    const value = local[row][col];
    if (value !== 0 && value === local[row + 1][col] && value === local[row][col + 1] && value === local[row + 1][col + 1]) violations += 1;
  }
  for (let value = 1; value <= 3; value += 1) {
    const seen = new Set();
    for (let start = 0; start < 9; start += 1) {
      if (seen.has(start) || local[Math.floor(start / 3)][start % 3] !== value) continue;
      const stack = [start]; seen.add(start); let size = 0;
      while (stack.length) {
        const current = stack.pop(); size += 1;
        const row = Math.floor(current / 3); const col = current % 3;
        for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = row + dy; const nc = col + dx; const next = nr * 3 + nc;
          if (nr >= 0 && nr < 3 && nc >= 0 && nc < 3 && !seen.has(next) && local[nr][nc] === value) { seen.add(next); stack.push(next); }
        }
      }
      if (size >= 4) violations += 1;
    }
  }
  return violations;
}

function countUniformLineViolations(cells) {
  const kind = (line) => line.every((v) => v === 0) ? "empty" : line.every((v) => v !== 0) ? "filled" : "mixed";
  const count = (kinds) => kinds.slice(1).reduce((sum, item, index) => sum + (item !== "mixed" && item === kinds[index] ? 1 : 0), 0);
  return count(cells.map(kind)) + count(Array.from({ length: 10 }, (_, col) => kind(cells.map((row) => row[col]))));
}

function weightedValue(profile, rng) {
  const n = rng.next(); let total = 0;
  for (let index = 0; index < profile.initialProbabilities.length; index += 1) { total += profile.initialProbabilities[index]; if (n < total) return profile.cellValues[index]; }
  return 3;
}

function compareScores(a, b) { for (let i = 0; i < a.length; i += 1) { if (Math.abs(a[i] - b[i]) > EPSILON) return a[i] < b[i] ? -1 : 1; } return 0; }
function rangeViolation(value, min, max) { return Math.max(0, min - value) + Math.max(0, value - max); }
function inRange(value, min, max) { return value >= min - EPSILON && value <= max + EPSILON; }
function moveKey(row, col, oldValue, newValue) { return `${row}:${col}:${oldValue}:${newValue}`; }
function fnv1a(text) { let hash = 0x811c9dc5; for (const byte of new TextEncoder().encode(text)) { hash ^= byte; hash = Math.imul(hash, 0x01000193); } return hash >>> 0; }

class Rng {
  constructor(seed) { this.state = fnv1a(seed); }
  next() { this.state |= 0; this.state = (this.state + 0x6d2b79f5) | 0; let value = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state); value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value; return ((value ^ (value >>> 14)) >>> 0) / 4294967296; }
  int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  choice(items) { return items[this.int(0, items.length - 1)]; }
}
