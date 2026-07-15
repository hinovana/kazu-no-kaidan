import { GENERATOR_VERSION, levelProfile } from "./config.js?v=4";
import { canonicalBoardSignature, validateProblem } from "./validator.js?v=4";
import { buildNeumannProblem } from "./neumann-generator.js?v=2";

const answerPatternCache = new Map();
const EPSILON = 1e-12;

export class GenerationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "GenerationError";
    this.details = details;
  }
}

export function buildProblem(level, seed, options = {}) {
  const profile = levelProfile(Number(level));
  const normalizedSeed = normalizeSeed(seed);
  const questionIndex = integerOption(options.questionIndex, 0, "questionIndex");
  const variantIndex = integerOption(options.variantIndex, 0, "variantIndex");
  if (variantIndex > profile.maxVariantIndex) throw new RangeError("variantIndexが上限を超えています");
  if (profile.mode === "triple-order") {
    return buildNeumannProblem(profile, normalizedSeed, questionIndex, variantIndex, GENERATOR_VERSION);
  }

  const problemSeed = [GENERATOR_VERSION, profile.level, normalizedSeed, questionIndex, variantIndex].join("\0");
  const problemRng = new Rng(problemSeed);
  const answer = {
    row: problemRng.int(0, profile.rows - 3),
    col: problemRng.int(0, profile.cols - 3),
  };
  const rule = selectRule(profile, problemRng);
  let totalRepairSteps = 0;

  for (let restartIndex = 0; restartIndex < profile.maxRestarts; restartIndex += 1) {
    const rng = new Rng(`${problemSeed}\0restart\0${restartIndex}`);
    const cells = initialBoard(profile, answer, rule, rng);
    const tabu = new Map();
    let bestScore = null;
    let stagnationCount = 0;

    for (let step = 0; step <= profile.maxRepairStepsPerRestart; step += 1) {
      const analysis = analyzeBoard(cells, profile, answer, rule);
      const score = scoreAnalysis(analysis, profile);
      if (isAcceptable(analysis, profile, answer)) {
        const problem = makeProblem({
          profile,
          normalizedSeed,
          questionIndex,
          variantIndex,
          answer,
          rule,
          cells,
          analysis,
          restartIndex,
          repairStepCount: totalRepairSteps,
        });
        const validation = validateProblem(problem);
        if (!validation.valid) {
          throw new GenerationError("独立バリデータが生成結果を拒否しました", {
            level: profile.level,
            errors: validation.errors,
          });
        }
        return problem;
      }
      if (step === profile.maxRepairStepsPerRestart) break;

      const moves = candidateMoves(cells, profile, answer, analysis);
      const bestMoves = [];
      let bestMoveScore = null;
      for (const move of moves) {
        const tabuKey = moveKey(move.row, move.col, move.oldValue, move.newValue);
        const expiry = tabu.get(tabuKey);
        if (expiry !== undefined && expiry > step) continue;

        cells[move.row][move.col] = move.newValue;
        const moveScore = scoreAnalysis(analyzeBoard(cells, profile, answer, rule), profile);
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

  throw new GenerationError("指定条件を満たす問題を生成できませんでした", {
    level: profile.level,
    seed: normalizedSeed,
    questionIndex,
    variantIndex,
    rule,
    maxRestarts: profile.maxRestarts,
  });
}

export function buildWorksheet(level, seed, options = {}) {
  const profile = levelProfile(Number(level));
  const questionCount = integerOption(options.questionCount, 6, "questionCount");
  if (questionCount < 1 || questionCount > 30) throw new RangeError("questionCountは1から30で指定してください");

  const problems = [];
  const signatures = new Set();
  for (let questionIndex = 0; questionIndex < questionCount; questionIndex += 1) {
    let accepted = null;
    for (let variantIndex = 0; variantIndex <= profile.maxVariantIndex; variantIndex += 1) {
      const problem = buildProblem(level, seed, { questionIndex, variantIndex });
      const signature = canonicalBoardSignature(problem);
      if (!signatures.has(signature)) {
        signatures.add(signature);
        accepted = problem;
        break;
      }
    }
    if (!accepted) {
      throw new GenerationError("重複しない問題セットを生成できませんでした", {
        level: profile.level,
        seed: normalizeSeed(seed),
        questionIndex,
        maxVariantIndex: profile.maxVariantIndex,
      });
    }
    problems.push(accepted);
  }
  return problems;
}

function selectRule(profile, rng) {
  if (profile.mode === "pair-exact") return { ...rng.choice(profile.targetPairs) };
  if (profile.mode === "pair-relation") return { relation: rng.choice(profile.relations) };
  return { targetApple: rng.choice(profile.targets) };
}

function initialBoard(profile, answer, rule, rng) {
  const cells = Array.from({ length: profile.rows }, () =>
    Array.from({ length: profile.cols }, () => weightedCellValue(profile, rng))
  );
  const pattern = rng.choice(answerPatterns(profile, rule));
  let index = 0;
  for (let dy = 0; dy < 3; dy += 1) {
    for (let dx = 0; dx < 3; dx += 1) {
      cells[answer.row + dy][answer.col + dx] = pattern[index];
      index += 1;
    }
  }
  return cells;
}

function answerPatterns(profile, rule) {
  const key = `${profile.mode}:${profile.maxPerCell}:${JSON.stringify(rule)}`;
  if (answerPatternCache.has(key)) return answerPatternCache.get(key);
  const patterns = [];
  const current = Array(9).fill(0);

  if (isPairMode(profile.mode)) {
    const visit = (index, appleCount, pearCount) => {
      if (index === 9) {
        if (appleCount > 0 && pearCount > 0 && conditionMatches(rule, appleCount, pearCount)) {
          patterns.push([...current]);
        }
        return;
      }
      for (const value of profile.cellValues) {
        current[index] = value;
        visit(index + 1, appleCount + (value === 1 ? 1 : 0), pearCount + (value === 2 ? 1 : 0));
      }
    };
    visit(0, 0, 0);
  } else {
    const visit = (index, remaining) => {
      if (index === 9) {
        if (remaining === 0) patterns.push([...current]);
        return;
      }
      for (const value of profile.cellValues) {
        if (value > remaining) continue;
        current[index] = value;
        visit(index + 1, remaining - value);
      }
    };
    visit(0, rule.targetApple);
  }

  if (patterns.length === 0) throw new GenerationError(`正解枠パターンがありません: ${key}`);
  answerPatternCache.set(key, patterns);
  return patterns;
}

function candidateMoves(cells, profile, answer, analysis) {
  const answerCells = new Set();
  for (let dy = 0; dy < 3; dy += 1) {
    for (let dx = 0; dx < 3; dx += 1) answerCells.add((answer.row + dy) * profile.cols + answer.col + dx);
  }

  const eligible = new Set();
  if (analysis.competitors.length > 0) {
    for (const window of analysis.competitors) {
      for (let dy = 0; dy < 3; dy += 1) {
        for (let dx = 0; dx < 3; dx += 1) {
          const key = (window.row + dy) * profile.cols + window.col + dx;
          if (!answerCells.has(key)) eligible.add(key);
        }
      }
    }
  } else {
    for (let row = 0; row < profile.rows; row += 1) {
      for (let col = 0; col < profile.cols; col += 1) {
        const key = row * profile.cols + col;
        if (!answerCells.has(key)) eligible.add(key);
      }
    }
  }

  const moves = [];
  for (const key of [...eligible].sort((a, b) => a - b)) {
    const row = Math.floor(key / profile.cols);
    const col = key % profile.cols;
    const oldValue = cells[row][col];
    for (const newValue of profile.cellValues) {
      if (newValue !== oldValue) moves.push({ row, col, oldValue, newValue });
    }
  }
  return moves;
}

function analyzeBoard(cells, profile, answer, rule) {
  const windows = [];
  const solutions = [];
  const nearMisses = [];
  for (let row = 0; row <= profile.rows - 3; row += 1) {
    for (let col = 0; col <= profile.cols - 3; col += 1) {
      const counts = countWindow(cells, row, col, profile.mode);
      const distance = ruleDistance(rule, counts.appleCount, counts.pearCount);
      const window = { row, col, ...counts, distance };
      windows.push(window);
      if (distance === 0) solutions.push(window);
      if (distance === 1) nearMisses.push(window);
    }
  }
  const competitors = solutions.filter((window) => window.row !== answer.row || window.col !== answer.col);
  const adjacentNearMissCount = nearMisses.filter(
    (window) => Math.max(Math.abs(window.row - answer.row), Math.abs(window.col - answer.col)) === 1
  ).length;
  const relationConflictMargin =
    rule.relation === "apple-less"
      ? competitors.reduce((sum, window) => sum + (window.pearCount - window.appleCount), 0)
      : 0;

  let occupiedCellCount = 0;
  let totalAppleCount = 0;
  let totalPearCount = 0;
  for (const row of cells) {
    for (const value of row) {
      if (value !== 0) occupiedCellCount += 1;
      if (isPairMode(profile.mode)) {
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
      const value = cells[answer.row + dy][answer.col + dx];
      if (value !== 0) answerOccupiedCellCount += 1;
      if (isPairMode(profile.mode)) answerFruitCount += value === 0 ? 0 : 1;
      else answerFruitCount += value;
    }
  }

  const totalFruitCount = totalAppleCount + totalPearCount;
  const cellCount = profile.rows * profile.cols;
  const densityDenominator = isPairMode(profile.mode) ? cellCount : cellCount * profile.maxPerCell;
  const answerDensityDenominator = isPairMode(profile.mode) ? 9 : 9 * profile.maxPerCell;
  return {
    windows,
    solutions,
    competitors,
    nearMissCount: nearMisses.length,
    adjacentNearMissCount,
    relationConflictMargin,
    occupiedCellCount,
    totalAppleCount,
    totalPearCount,
    totalFruitCount,
    occupiedCellDensity: occupiedCellCount / cellCount,
    fruitLoadDensity: totalFruitCount / densityDenominator,
    answerOccupiedCellDensity: answerOccupiedCellCount / 9,
    answerFruitLoadDensity: answerFruitCount / answerDensityDenominator,
    uniformLineViolationCount: countUniformLineViolations(cells),
  };
}

function countWindow(cells, row, col, mode) {
  let appleCount = 0;
  let pearCount = 0;
  for (let dy = 0; dy < 3; dy += 1) {
    for (let dx = 0; dx < 3; dx += 1) {
      const value = cells[row + dy][col + dx];
      if (isPairMode(mode)) {
        if (value === 1) appleCount += 1;
        if (value === 2) pearCount += 1;
      } else {
        appleCount += value;
      }
    }
  }
  return { count: appleCount, appleCount, pearCount };
}

function conditionMatches(rule, appleCount, pearCount) {
  return ruleDistance(rule, appleCount, pearCount) === 0;
}

function ruleDistance(rule, appleCount, pearCount) {
  if (rule.relation === "equal") return Math.abs(appleCount - pearCount);
  if (rule.relation === "apple-less") return appleCount < pearCount ? 0 : appleCount - pearCount + 1;
  if (Number.isInteger(rule.targetPear)) {
    return Math.abs(appleCount - rule.targetApple) + Math.abs(pearCount - rule.targetPear);
  }
  return Math.abs(appleCount - rule.targetApple);
}

function scoreAnalysis(analysis, profile) {
  return [
    analysis.competitors.length,
    analysis.relationConflictMargin,
    Math.max(0, profile.requiredNearMissCount - analysis.nearMissCount),
    Math.max(0, profile.requiredAdjacentNearMissCount - analysis.adjacentNearMissCount),
    rangeViolation(analysis.occupiedCellDensity) + rangeViolation(analysis.fruitLoadDensity),
    Math.max(0, Math.abs(analysis.answerOccupiedCellDensity - analysis.occupiedCellDensity) - 0.35) +
      Math.max(0, Math.abs(analysis.answerFruitLoadDensity - analysis.fruitLoadDensity) - 0.35),
    analysis.uniformLineViolationCount,
  ];
}

function isAcceptable(analysis, profile, answer) {
  return (
    analysis.solutions.length === 1 &&
    analysis.solutions[0].row === answer.row &&
    analysis.solutions[0].col === answer.col &&
    analysis.nearMissCount >= profile.requiredNearMissCount &&
    analysis.adjacentNearMissCount >= profile.requiredAdjacentNearMissCount &&
    inRange(analysis.occupiedCellDensity, 0.2, 0.8) &&
    inRange(analysis.fruitLoadDensity, 0.2, 0.8) &&
    Math.abs(analysis.answerOccupiedCellDensity - analysis.occupiedCellDensity) <= 0.35 + EPSILON &&
    Math.abs(analysis.answerFruitLoadDensity - analysis.fruitLoadDensity) <= 0.35 + EPSILON &&
    analysis.uniformLineViolationCount === 0
  );
}

function makeProblem({
  profile,
  normalizedSeed,
  questionIndex,
  variantIndex,
  answer,
  rule,
  cells,
  analysis,
  restartIndex,
  repairStepCount,
}) {
  const identity = [GENERATOR_VERSION, profile.level, normalizedSeed, questionIndex, variantIndex].join("\0");
  const metrics = {
    candidateWindowCount: analysis.windows.length,
    solutionCount: analysis.solutions.length,
    nearMissCount: analysis.nearMissCount,
    adjacentNearMissCount: analysis.adjacentNearMissCount,
    occupiedCellCount: analysis.occupiedCellCount,
    totalAppleCount: analysis.totalAppleCount,
    totalPearCount: analysis.totalPearCount,
    totalFruitCount: analysis.totalFruitCount,
    occupiedCellDensity: analysis.occupiedCellDensity,
    fruitLoadDensity: analysis.fruitLoadDensity,
    answerOccupiedCellDensity: analysis.answerOccupiedCellDensity,
    answerFruitLoadDensity: analysis.answerFruitLoadDensity,
    uniformLineViolationCount: analysis.uniformLineViolationCount,
    restartCount: restartIndex,
    repairStepCount,
  };
  return {
    schemaVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    problemId: `KS-L${profile.level}-${fnv1a(identity).toString(36).toUpperCase().padStart(7, "0").slice(0, 7)}`,
    level: profile.level,
    mode: profile.mode,
    seed: normalizedSeed,
    questionIndex,
    variantIndex,
    grid: {
      rows: profile.rows,
      cols: profile.cols,
      maxPerCell: profile.maxPerCell,
      ...(profile.cellStates ? { cellStates: [...profile.cellStates] } : {}),
      cells: cells.map((row) => [...row]),
    },
    rule: {
      windowRows: 3,
      windowCols: 3,
      ...rule,
    },
    answer: { ...answer },
    metrics,
  };
}

function weightedCellValue(profile, rng) {
  const value = rng.next();
  let cumulative = 0;
  for (let index = 0; index < profile.initialProbabilities.length; index += 1) {
    cumulative += profile.initialProbabilities[index];
    if (value < cumulative || index === profile.initialProbabilities.length - 1) return profile.cellValues[index];
  }
  return profile.cellValues[profile.cellValues.length - 1];
}

function isPairMode(mode) {
  return mode === "pair-exact" || mode === "pair-relation";
}

function countUniformLineViolations(cells) {
  const rows = cells.map(lineKind);
  const cols = Array.from({ length: cells[0].length }, (_, col) => lineKind(cells.map((row) => row[col])));
  return countAdjacentUniform(rows) + countAdjacentUniform(cols);
}

function lineKind(values) {
  if (values.every((value) => value === 0)) return "empty";
  if (values.every((value) => value !== 0)) return "filled";
  return "mixed";
}

function countAdjacentUniform(kinds) {
  let count = 0;
  for (let index = 1; index < kinds.length; index += 1) {
    if (kinds[index] !== "mixed" && kinds[index] === kinds[index - 1]) count += 1;
  }
  return count;
}

function compareScores(a, b) {
  for (let index = 0; index < a.length; index += 1) {
    if (Math.abs(a[index] - b[index]) <= EPSILON) continue;
    return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function rangeViolation(value) {
  return Math.max(0, 0.2 - value) + Math.max(0, value - 0.8);
}

function inRange(value, min, max) {
  return value >= min - EPSILON && value <= max + EPSILON;
}

function moveKey(row, col, oldValue, newValue) {
  return `${row}:${col}:${oldValue}:${newValue}`;
}

function normalizeSeed(seed) {
  if (typeof seed !== "string" || seed.length === 0) throw new TypeError("seedは空でない文字列で指定してください");
  return seed.normalize("NFC");
}

function integerOption(value, fallback, label) {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isInteger(resolved) || resolved < 0) throw new TypeError(`${label}は0以上の整数で指定してください`);
  return resolved;
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

class Rng {
  constructor(seedText) {
    this.state = fnv1a(seedText);
  }

  next() {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let value = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice(items) {
    return items[this.int(0, items.length - 1)];
  }
}
