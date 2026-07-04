export function isAcceptablePuzzle(problem, answerProblem, constraints = { requireUniqueEveryStep: false }) {
  const report = solveWithoutBranching(problem);
  const metrics = problemMetrics(problem, answerProblem, report);
  if (constraints.requireUniqueEveryStep && metrics.maxReadyCount !== 1) {
    return false;
  }

  return (
    metrics.initialReadyCount === 1 &&
    metrics.completedRunCount === 0 &&
    metrics.uniqueSolution &&
    metrics.redundantGivenCount === 0 &&
    report.unresolved.length === 0 &&
    answersMatch(answerProblem, report.values)
  );
}

export function givenValues(problem) {
  const values = {};
  for (const node of problem.nodes) {
    if (Object.prototype.hasOwnProperty.call(node, "given")) {
      values[node.id] = node.given;
    }
  }
  return values;
}

export function solveWithoutBranching(problem) {
  const values = givenValues(problem);
  const steps = [];
  const readyHistory = [];

  while (true) {
    assertKnownRunsConsistent(problem, values);
    const ready = readyRuns(problem, values);
    readyHistory.push(ready.map((item) => item.run.id));
    if (ready.length === 0) {
      break;
    }

    const { run, missing } = ready[0];
    const nodeId = missing[0];
    const value = runValue(run.nodes, values, nodeId);
    values[nodeId] = value;
    steps.push({
      runId: run.id,
      runNodes: run.nodes,
      nodeId,
      value,
      readyCount: ready.length,
      readyRunIds: ready.map((item) => item.run.id),
    });
  }

  return {
    values,
    steps,
    unresolved: problem.nodes.map((node) => node.id).filter((nodeId) => values[nodeId] === undefined),
    readyHistory,
    initialReadyCount: readyHistory[0] ? readyHistory[0].length : 0,
    maxReadyCount: readyHistory.reduce((max, readyRunIds) => Math.max(max, readyRunIds.length), 0),
  };
}

export function solveBookLevel7(problem) {
  const minValue = 1;
  const maxValue = 20;
  const given = givenValues(problem);
  const t0 = given.t0;
  const b1 = given.b1;
  const m3 = given.m3;
  const constant = 4 * t0 + 3 * b1 + 2 * m3;
  const initialReady = readyRuns(problem, given);
  const candidates = [];

  for (let b2 = minValue; b2 <= maxValue; b2 += 1) {
    const t1Numerator = constant - 4 * b2;
    if (t1Numerator % 5 !== 0) {
      continue;
    }

    const t1 = t1Numerator / 5;
    const values = bookLevel7Values({ t0, b1, m3, t1, b2 });
    if (bookLevel7CandidateIsValid(problem, values, minValue, maxValue)) {
      candidates.push(values);
    }
  }

  const uniqueSolution = candidates.length === 1;
  const values = uniqueSolution ? candidates[0] : given;
  return {
    kind: "text",
    values,
    steps: bookLevel7TextSteps(problem, values, constant, minValue, maxValue).map((text) => ({ text })),
    explanationLines: bookLevel7Explanation(values),
    unresolved: uniqueSolution ? [] : problem.nodes.map((node) => node.id).filter((nodeId) => values[nodeId] === undefined),
    readyHistory: [initialReady.map((item) => item.run.id)],
    initialReadyCount: initialReady.length,
    maxReadyCount: initialReady.length,
    uniqueSolution,
    candidateCount: candidates.length,
  };
}

export function problemMetrics(problem, answerProblem = problem, report = solveWithoutBranching(problem)) {
  const values = givenValues(problem);
  const givenIds = problem.nodes.filter((node) => Object.prototype.hasOwnProperty.call(node, "given")).map((node) => node.id);
  const redundant = redundantGivenIds(problem);
  return {
    uniqueSolution: hasUniqueLinearSolution(problem),
    initialReadyCount: report.initialReadyCount,
    maxReadyCount: report.maxReadyCount,
    givenCount: givenIds.length,
    stepCount: report.steps.length,
    unresolvedCount: report.unresolved.length,
    completedRunCount: completedRuns(problem, values).length,
    redundantGivenCount: redundant.length,
    redundantGivenIds: redundant,
    patternSignature: givenSignature(givenIds),
    answersMatch: answersMatch(answerProblem, report.values),
  };
}

export function bookProblemMetrics(problem, report) {
  const values = givenValues(problem);
  const givenIds = problem.nodes.filter((node) => Object.prototype.hasOwnProperty.call(node, "given")).map((node) => node.id);
  return {
    uniqueSolution: report.uniqueSolution,
    linearUniqueSolution: hasUniqueLinearSolution(problem),
    domainUniqueSolution: report.uniqueSolution,
    initialReadyCount: report.initialReadyCount,
    maxReadyCount: report.maxReadyCount,
    givenCount: givenIds.length,
    stepCount: report.steps.length,
    unresolvedCount: report.unresolved.length,
    completedRunCount: completedRuns(problem, values).length,
    redundantGivenCount: 0,
    redundantGivenIds: [],
    patternSignature: givenSignature(givenIds),
    answersMatch: report.uniqueSolution && answersMatch(problem, report.values),
    solver: "book-level7",
  };
}

export function readyRuns(problem, values) {
  return problem.runs
    .map((run) => {
      const missing = run.nodes.filter((nodeId) => values[nodeId] === undefined);
      return { run, missing };
    })
    .filter((item) => item.missing.length === 1);
}

export function completedRuns(problem, values) {
  return problem.runs.filter((run) => run.nodes.every((nodeId) => values[nodeId] !== undefined));
}

export function hasUniqueLinearSolution(problem) {
  const nodeIndex = Object.fromEntries(problem.nodes.map((node, index) => [node.id, index]));
  const rows = [];

  for (const run of problem.runs) {
    const row = Array(problem.nodes.length).fill(0);
    const [a, b, c] = run.nodes;
    row[nodeIndex[a]] = 1;
    row[nodeIndex[b]] = -2;
    row[nodeIndex[c]] = 1;
    rows.push(row);
  }

  for (const node of problem.nodes) {
    if (Object.prototype.hasOwnProperty.call(node, "given")) {
      const row = Array(problem.nodes.length).fill(0);
      row[nodeIndex[node.id]] = 1;
      rows.push(row);
    }
  }

  return matrixRank(rows) === problem.nodes.length;
}

export function answersMatch(problem, values) {
  return problem.nodes.every((node) => values[node.id] === node.answer);
}

export function formatValue(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

export function runNodesText(runNodes) {
  return `(${runNodes.join(", ")})`;
}

export function givenSignature(givenIds) {
  return [...givenIds].sort().join("|");
}

function assertKnownRunsConsistent(problem, values) {
  for (const run of problem.runs) {
    const missing = run.nodes.filter((nodeId) => values[nodeId] === undefined);
    if (missing.length !== 0) {
      continue;
    }

    const [a, b, c] = run.nodes;
    if (values[a] + values[c] !== 2 * values[b]) {
      throw new Error(`contradiction in ${run.id}`);
    }
  }
}

function runValue(runNodes, values, missingId) {
  const [a, b, c] = runNodes;
  if (missingId === a) {
    return 2 * values[b] - values[c];
  }
  if (missingId === b) {
    return (values[a] + values[c]) / 2;
  }
  if (missingId === c) {
    return 2 * values[b] - values[a];
  }
  throw new Error(`${missingId} is not in (${runNodes.join(", ")})`);
}

function redundantGivenIds(problem) {
  const givenIds = problem.nodes.filter((node) => Object.prototype.hasOwnProperty.call(node, "given")).map((node) => node.id);
  return givenIds.filter((givenId) => {
    const reduced = {
      ...problem,
      nodes: problem.nodes.map((node) => {
        const next = { id: node.id, x: node.x, y: node.y, answer: node.answer };
        if (Object.prototype.hasOwnProperty.call(node, "given") && node.id !== givenId) {
          next.given = node.given;
        }
        return next;
      }),
    };
    return hasUniqueLinearSolution(reduced);
  });
}

function bookLevel7Values({ t0, b1, m3, t1, b2 }) {
  const values = {
    t0,
    t1,
    t2: 2 * t1 - t0,
    t3: 3 * t1 - 2 * t0,
    b1,
    b2,
    b0: 2 * b1 - b2,
    b3: 2 * b2 - b1,
    m3,
  };
  values.m0 = (values.t2 + values.b2) / 2;
  values.m1 = (values.t3 + values.b3) / 2;
  values.m2 = (values.m1 + values.m3) / 2;
  return values;
}

function bookLevel7CandidateIsValid(problem, values, minValue, maxValue) {
  for (const node of problem.nodes) {
    const value = values[node.id];
    if (!Number.isInteger(value) || value < minValue || value > maxValue) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(node, "given") && node.given !== value) {
      return false;
    }
  }

  return problem.runs.every((run) => {
    const [a, b, c] = run.nodes;
    return values[a] + values[c] === 2 * values[b];
  });
}

function bookLevel7TextSteps(problem, values, constant, minValue, maxValue) {
  return [
    `初期配置では、2つ分かっていて1つ決まる3マス組は ${readyRuns(problem, givenValues(problem)).length} 箇所です。`,
    `このレベルでは、${minValue}〜${maxValue} の整数という範囲も使います。`,
    `b2 = x とおくと、下段から b0 = 2*b1 - x、b3 = 2*x - b1 です。`,
    `t1 = y とおくと、上段から t2 = 2*y - t0、t3 = 3*y - 2*t0 です。`,
    `中央と縦の条件を整理すると、5*y + 4*x = ${constant} になります。`,
    `整数範囲で成り立つのは x = ${values.b2}, y = ${values.t1} だけです。`,
    `したがって b2 = ${values.b2}, t1 = ${values.t1} から、残りのマスも順に決まります。`,
  ];
}

function bookLevel7Explanation(values) {
  return [
    "この問題は、通常の「2つ分かれば1つ決まる」だけでは初手がありません。",
    "そのため、整数の範囲と式の整理を使うタイプの問題として扱います。",
    `b2 = ${values.b2}, t1 = ${values.t1} だけが条件を満たすため、解答は一意に決まります。`,
    "標準のレベル1〜6より一段難しいので、レベル7として扱います。",
  ];
}

function matrixRank(rows) {
  const matrix = rows.map((row) => [...row]);
  const rowCount = matrix.length;
  const columnCount = matrix[0] ? matrix[0].length : 0;
  let rank = 0;
  const epsilon = 1e-9;

  for (let col = 0; col < columnCount && rank < rowCount; col += 1) {
    let pivot = rank;
    for (let row = rank + 1; row < rowCount; row += 1) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) {
        pivot = row;
      }
    }

    if (Math.abs(matrix[pivot][col]) <= epsilon) {
      continue;
    }

    [matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
    const pivotValue = matrix[rank][col];
    for (let c = col; c < columnCount; c += 1) {
      matrix[rank][c] /= pivotValue;
    }

    for (let row = 0; row < rowCount; row += 1) {
      if (row === rank || Math.abs(matrix[row][col]) <= epsilon) {
        continue;
      }
      const factor = matrix[row][col];
      for (let c = col; c < columnCount; c += 1) {
        matrix[row][c] -= factor * matrix[rank][c];
      }
    }

    rank += 1;
  }

  return rank;
}
