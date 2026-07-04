import {
  bookProblemMetrics,
  givenSignature,
  isAcceptablePuzzle,
  problemMetrics,
  solveBookLevel7,
  solveWithoutBranching,
} from "./solver.js";

const LEVEL_TEMPLATES = [
  {
    level: 1,
    minGivens: 6,
    source: "problem1",
    nodes: `
t0 22.5 139.875 1 1
t1 63.75 139.875 2 _
t2 105.0 139.875 3 _
t3 146.25 139.875 4 _
t4 187.5 139.875 3 _
m0 43.125 160.5 3 _
m1 84.375 160.5 4 _
m2 125.625 160.5 5 _
m3 166.875 160.5 5 _
b0 22.5 181.125 4 4
b1 63.75 181.125 5 5
b2 105.0 181.125 6 6
b3 146.25 181.125 7 7
b4 187.5 181.125 6 6
`,
    edges: `t0-m0 t1-m0 t1-m1 t2-m1 t2-m2 t3-m2 t3-m3 t4-m3 m0-b0 m0-b1 m1-b1 m1-b2 m2-b2 m2-b3 m3-b3 m3-b4`,
    runs: `t0,m0,b1; t1,m0,b0; t1,m1,b2; t2,m1,b1; t2,m2,b3; t3,m2,b2; t3,m3,b4; t4,m3,b3`,
  },
  {
    level: 2,
    minGivens: 7,
    source: "problem2",
    nodes: `
a0 86.846 92.559 7 _
a1 121.356 92.559 5 5
a2 152.631 92.559 3 _
b0 22.5 124.912 2 2
b1 48.742 124.912 3 3
b2 86.846 124.912 4 _
b3 152.631 124.912 4 4
c0 86.846 161.219 1 1
c1 121.356 161.219 3 _
c2 152.631 161.219 5 _
c3 187.5 161.219 7 _
d0 121.356 194.65 2 2
d1 187.5 194.65 8 8
e0 121.356 228.441 1 _
e1 152.631 228.441 5 _
e2 187.5 228.441 9 _
`,
    edges: `a0-a1 a0-b2 a1-a2 a2-b3 b0-b1 b1-b2 b2-c0 b3-c2 c0-c1 c1-c2 c1-d0 c2-c3 c3-d1 d0-e0 d1-e2 e0-e1 e1-e2`,
    runs: `a0,a1,a2; b0,b1,b2; a0,b2,c0; a2,b3,c2; c0,c1,c2; c1,c2,c3; c1,d0,e0; c3,d1,e2; e0,e1,e2`,
  },
  {
    level: 3,
    minGivens: 10,
    source: "problem3",
    nodes: `
a0 22.5 140.322 5 _
a1 43.97 140.322 7 7
a2 63.452 140.322 9 _
a3 106.392 140.322 7 _
a4 127.861 140.322 5 5
a5 146.548 140.322 3 _
a6 187.5 140.322 11 _
b0 22.5 159.605 3 3
b1 63.452 159.605 6 6
b2 106.392 159.605 4 4
b3 146.548 159.605 6 6
b4 187.5 159.605 6 6
c0 22.5 180.678 1 1
c1 63.452 180.678 3 _
c2 82.337 180.678 2 2
c3 106.392 180.678 1 _
c4 146.548 180.678 9 _
c5 169.211 180.678 5 5
c6 187.5 180.678 1 _
`,
    edges: `a0-a1 a0-b0 a1-a2 a2-b1 a3-a4 a3-b2 a4-a5 a5-b3 a6-b4 b0-c0 b1-c1 b2-c3 b3-c4 b4-c6 c1-c2 c2-c3 c4-c5 c5-c6`,
    runs: `a0,a1,a2; a0,b0,c0; a2,b1,c1; a3,a4,a5; a3,b2,c3; c1,c2,c3; a5,b3,c4; a6,b4,c6; c4,c5,c6`,
  },
  {
    level: 4,
    minGivens: 10,
    source: "problem4",
    nodes: `
a0 77.404 89.929 8 8
b0 22.5 117.813 2 2
b1 49.808 117.813 4 4
b2 77.404 117.813 6 _
b3 105.0 117.813 9 9
c0 49.808 145.983 1 1
c1 77.404 145.983 4 _
c2 105.0 145.983 7 _
c3 132.308 145.983 1 1
d0 77.404 174.442 8 8
d1 105.0 174.442 5 _
d2 132.308 174.442 2 _
d3 159.904 174.442 2 2
e0 105.0 202.9 2 2
e1 132.308 202.9 3 _
e2 159.904 202.9 4 _
f0 132.308 231.071 2 2
f1 159.904 231.071 6 _
f2 187.5 231.071 10 _
`,
    edges: `a0-b2 b0-b1 b1-b2 b2-c1 b3-c2 c0-c1 c1-c2 c2-d1 c3-d2 d0-d1 d1-d2 d2-e1 d3-e2 e0-e1 e1-e2 e2-f1 f0-f1 f1-f2`,
    runs: `a0,b2,c1; b0,b1,b2; b3,c2,d1; c0,c1,c2; c3,d2,e1; d0,d1,d2; d3,e2,f1; e0,e1,e2; f0,f1,f2`,
  },
  {
    level: 5,
    minGivens: 10,
    source: "problem5",
    nodes: `
a0 22.5 117.932 12 _
a1 47.614 117.932 10 10
a2 76.495 117.932 8 _
a3 104.372 117.932 6 _
a4 133.253 117.932 17 _
a5 158.87 117.932 10 10
a6 187.5 117.932 3 _
b0 22.5 147.315 9 _
b1 76.495 147.315 9 9
b2 104.372 147.315 10 10
b3 133.253 147.315 11 11
b4 187.5 147.315 5 _
c0 22.5 174.689 6 6
c1 76.495 174.689 7 7
c2 104.372 174.689 14 _
c3 133.253 174.689 5 _
c4 187.5 174.689 7 7
d0 22.5 203.068 3 _
d1 47.614 203.068 4 4
d2 76.495 203.068 5 _
d3 104.372 203.068 18 _
d4 133.253 203.068 15 15
d5 158.87 203.068 12 _
d6 187.5 203.068 9 _
`,
    edges: `a0-a1 a0-b0 a1-a2 a2-a3 a3-b2 a4-a5 a4-b3 a5-a6 a6-b4 b0-c0 b1-c1 b2-c2 b3-c3 b4-c4 c0-d0 c1-d2 c2-d3 c4-d6 d0-d1 d1-d2 d3-d4 d4-d5 d5-d6`,
    runs: `a0,a1,a2; a1,a2,a3; a0,b0,c0; b0,c0,d0; b1,c1,d2; d0,d1,d2; a3,b2,c2; b2,c2,d3; a4,a5,a6; a4,b3,c3; a6,b4,c4; b4,c4,d6; d3,d4,d5; d4,d5,d6`,
  },
  {
    level: 6,
    minGivens: 9,
    strictAvailable: false,
    source: "problem6",
    nodes: `
a0 71.061 58.0 2 2
a1 104.147 58.0 7 7
a2 137.575 58.0 12 _
b0 71.061 90.063 5 _
b1 104.147 90.063 7 _
b2 137.575 90.063 9 9
b3 172.026 90.063 11 _
c0 71.061 124.855 8 _
c1 104.147 124.855 2 2
c2 137.575 124.855 6 _
c3 172.026 124.855 10 _
d0 37.974 160.671 16 16
d1 71.061 160.671 11 _
d2 104.147 160.671 6 _
d3 137.575 160.671 1 _
d4 172.026 160.671 9 9
e0 37.974 195.804 9 _
e1 71.061 195.804 13 13
e2 104.147 195.804 10 _
e3 137.575 195.804 7 _
f0 37.974 230.596 2 _
f1 71.061 230.596 8 _
f2 104.147 230.596 14 14
f3 137.575 230.596 13 _
g0 71.061 263.0 3 _
g1 104.147 263.0 11 11
g2 137.575 263.0 19 _
`,
    edges: `a0-a1 a0-b0 a1-a2 a2-b2 b0-b1 b0-c0 b1-b2 b2-b3 b2-c2 b3-c3 c0-d1 c1-c2 c1-d2 c2-c3 c3-d4 d0-d1 d0-e0 d1-d2 d2-d3 d2-e2 d3-e3 e0-f0 e1-e2 e1-f1 e2-e3 e3-f3 f0-f1 f1-f2 f1-g0 f3-g2 g0-g1 g1-g2`,
    runs: `a0,a1,a2; a0,b0,c0; b0,c0,d1; b0,b1,b2; b1,b2,b3; a2,b2,c2; b3,c3,d4; c1,c2,c3; d0,d1,d2; d1,d2,d3; c1,d2,e2; e1,e2,e3; d3,e3,f3; e3,f3,g2; d0,e0,f0; e1,f1,g0; f0,f1,f2; g0,g1,g2`,
  },
  {
    level: 7,
    minGivens: 3,
    source: "book-problem",
    solver: "book-level7",
    strictAvailable: false,
    fixedValues: true,
    nodes: `
t0 22.5 115.0 3 3
t1 55.5 115.0 8 _
t2 88.5 115.0 13 _
t3 121.5 115.0 18 _
m0 88.5 155.0 8 _
m1 121.5 155.0 11 _
m2 154.5 155.0 14 _
m3 187.5 155.0 17 17
b0 22.5 195.0 1 _
b1 55.5 195.0 2 2
b2 88.5 195.0 3 _
b3 121.5 195.0 4 _
`,
    edges: `t0-t1 t1-t2 t2-t3 m0-m1 m1-m2 m2-m3 b0-b1 b1-b2 b2-b3 t2-m0 m0-b2 t3-m1 m1-b3`,
    runs: `t0,t1,t2; t1,t2,t3; m0,m1,m2; m1,m2,m3; b0,b1,b2; b1,b2,b3; t2,m0,b2; t3,m1,b3`,
  },
];

const RENDER = {
  pageWidth: 210,
  pageHeight: 297,
  maxGraphWidth: 165,
  maxGraphHeight: 205,
  graphCenterY: 160.5,
};

class Rng {
  constructor(seedText) {
    this.state = hashSeed(seedText);
  }

  next() {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice(items) {
    return items[this.int(0, items.length - 1)];
  }

  shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

export function buildProblem(level, seedText, options = {}) {
  const template = parseTemplate(LEVEL_TEMPLATES.find((item) => item.level === level));
  const rng = new Rng(seedText);
  const constraints = generationConstraints(options.mode || "standard");
  const baseMax = Math.max(...template.nodes.map((node) => node.baseAnswer));
  const scales = baseMax * 2 <= 20 ? [1, 2] : [1];
  const scale = template.fixedValues ? 1 : rng.choice(scales);
  const maxOffset = template.fixedValues ? 0 : Math.max(0, Math.min(5, 20 - baseMax * scale));
  const offset = template.fixedValues ? 0 : rng.int(0, maxOffset);

  const answerNodes = template.nodes.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    answer: node.baseAnswer * scale + offset,
  }));
  const problem = {
    title: "数字の階段",
    level,
    source: template.source,
    problemId: `L${level}-${hashSeed(seedText).toString(36).toUpperCase().slice(0, 6)}`,
    nodes: answerNodes,
    edges: template.edges,
    runs: template.runs,
    render: RENDER,
  };

  if (constraints.requireUniqueEveryStep && template.strictAvailable === false) {
    throw new Error("このレベルでは一本道モードの候補がありません");
  }

  if (template.solver === "book-level7") {
    for (const node of problem.nodes) {
      const templateNode = template.nodes.find((item) => item.id === node.id);
      if (templateNode.baseGiven) {
        node.given = node.answer;
      }
    }

    const report = solveBookLevel7(problem);
    if (!report.uniqueSolution || report.unresolved.length !== 0) {
      throw new Error("レベル7の整数範囲ソルバーで一意解が確認できません");
    }
    const metrics = bookProblemMetrics(problem, report);
    metrics.generationMode = constraints.mode;
    problem.metrics = metrics;
    return { problem, report, metrics };
  }

  const givenIds = chooseGivenIds(template, problem, rng, constraints);
  for (const node of problem.nodes) {
    if (givenIds.has(node.id)) {
      node.given = node.answer;
    }
  }

  const report = solveWithoutBranching(problem);
  if (!isAcceptablePuzzle(problem, problem, constraints)) {
    throw new Error("generated puzzle does not satisfy the generator constraints");
  }
  const metrics = problemMetrics(problem, problem, report);
  metrics.generationMode = constraints.mode;
  problem.metrics = metrics;
  return { problem, report, metrics };
}

function generationConstraints(mode) {
  if (mode === "strict") {
    return { mode: "strict", requireUniqueEveryStep: true };
  }
  return { mode: "standard", requireUniqueEveryStep: false };
}

function chooseGivenIds(template, answerProblem, rng, constraints) {
  if (constraints.requireUniqueEveryStep && template.strictAvailable === false) {
    throw new Error("このレベルでは一本道モードの候補がありません");
  }

  const allIds = answerProblem.nodes.map((node) => node.id);
  const baseGivenIds = new Set(template.nodes.filter((node) => node.baseGiven).map((node) => node.id));
  const baseCount = baseGivenIds.size;
  const minCount = Math.max(1, Math.min(template.minGivens, allIds.length - 1));
  const maxCount = Math.max(minCount, Math.min(baseCount, allIds.length - 1));

  for (let targetCount = minCount; targetCount <= maxCount; targetCount += 1) {
    const seed = findValidSeedSet(answerProblem, baseGivenIds, allIds, targetCount, rng, template.level, constraints);
    if (!seed) {
      continue;
    }

    const accepted = new Map([[givenSignature(seed), seed]]);
    let current = seed;
    const attempts = 600 + template.level * 180;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const proposal = mutateGivenSet(current, allIds, targetCount, rng);
      if (!proposal || !isAcceptablePuzzle(withGivens(answerProblem, proposal), answerProblem, constraints)) {
        continue;
      }

      current = proposal;
      accepted.set(givenSignature(current), current);
    }

    const candidates = [...accepted.values()];
    return new Set(rng.choice(candidates));
  }

  throw new Error("no acceptable given pattern found");
}

function findValidSeedSet(answerProblem, baseGivenIds, allIds, targetCount, rng, level, constraints) {
  let current = resizedGivenSet(baseGivenIds, allIds, targetCount, rng);
  if (isAcceptablePuzzle(withGivens(answerProblem, current), answerProblem, constraints)) {
    return current;
  }

  const exhaustiveSeed = findExhaustiveValidSet(answerProblem, allIds, targetCount, rng, constraints);
  if (exhaustiveSeed) {
    return exhaustiveSeed;
  }

  const attempts = 700 + level * 260;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt % 37 === 36) {
      current = randomGivenSet(allIds, targetCount, rng);
    } else {
      const proposal = mutateGivenSet(current, allIds, targetCount, rng);
      current = proposal || randomGivenSet(allIds, targetCount, rng);
    }

    if (isAcceptablePuzzle(withGivens(answerProblem, current), answerProblem, constraints)) {
      return current;
    }
  }

  return null;
}

function parseTemplate(template) {
  if (!template) {
    throw new Error("unknown level");
  }

  const nodes = template.nodes
    .trim()
    .split(/\n+/)
    .map((line) => {
      const [id, x, y, answer, given] = line.trim().split(/\s+/);
      return {
        id,
        x: Number(x),
        y: Number(y),
        baseAnswer: Number(answer),
        baseGiven: given !== "_",
      };
    });
  const edges = template.edges.trim().split(/\s+/).map((edge) => edge.split("-"));
  const runs = template.runs
    .split(";")
    .map((run, index) => ({ id: `r${index}`, nodes: run.trim().split(",") }));
  return { ...template, nodes, edges, runs };
}

function findExhaustiveValidSet(answerProblem, allIds, targetCount, rng, constraints) {
  const total = combinationCount(allIds.length, targetCount);
  if (total > 20000) {
    return null;
  }

  const accepted = [];
  visitCombinations(allIds, targetCount, (candidate) => {
    if (isAcceptablePuzzle(withGivens(answerProblem, new Set(candidate)), answerProblem, constraints)) {
      accepted.push(new Set(candidate));
    }
  });
  return accepted.length > 0 ? rng.choice(accepted) : null;
}

function combinationCount(n, k) {
  const m = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= m; i += 1) {
    result = (result * (n - m + i)) / i;
  }
  return Math.round(result);
}

function visitCombinations(items, targetCount, visit, start = 0, selected = []) {
  if (selected.length === targetCount) {
    visit(selected);
    return;
  }

  const remaining = targetCount - selected.length;
  for (let index = start; index <= items.length - remaining; index += 1) {
    selected.push(items[index]);
    visitCombinations(items, targetCount, visit, index + 1, selected);
    selected.pop();
  }
}

function resizedGivenSet(baseGivenIds, allIds, targetCount, rng) {
  const result = new Set(baseGivenIds);
  while (result.size > targetCount) {
    result.delete(rng.choice([...result]));
  }

  while (result.size < targetCount) {
    const addable = allIds.filter((nodeId) => !result.has(nodeId));
    result.add(rng.choice(addable));
  }

  return result;
}

function randomGivenSet(allIds, targetCount, rng) {
  return new Set(rng.shuffle(allIds).slice(0, targetCount));
}

function mutateGivenSet(givenIds, allIds, targetCount, rng) {
  const proposal = new Set(givenIds);
  const swapCount = rng.choice([1, 1, 1, 2]);

  for (let i = 0; i < swapCount; i += 1) {
    const removable = [...proposal];
    const addable = allIds.filter((nodeId) => !proposal.has(nodeId));
    if (removable.length === 0 || addable.length === 0) {
      return null;
    }
    proposal.delete(rng.choice(removable));
    proposal.add(rng.choice(addable));
  }

  return proposal.size === targetCount ? proposal : null;
}

function withGivens(answerProblem, givenIds) {
  return {
    ...answerProblem,
    nodes: answerProblem.nodes.map((node) => {
      const next = { id: node.id, x: node.x, y: node.y, answer: node.answer };
      if (givenIds.has(node.id)) {
        next.given = node.answer;
      }
      return next;
    }),
  };
}

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
