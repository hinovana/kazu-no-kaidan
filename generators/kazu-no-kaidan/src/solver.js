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
  const initialReady = readyRuns(problem, given);
  const candidates = bookLevel7CandidateValues().filter((values) => bookLevel7CandidateIsValid(problem, values, minValue, maxValue));

  const uniqueSolution = candidates.length === 1;
  const values = uniqueSolution ? candidates[0] : given;
  return {
    kind: "text",
    values,
    steps: bookLevel7TextSteps(problem, values, candidates.length, minValue, maxValue).map((text) => ({ text })),
    explanationLines: bookLevel7Explanation(problem, values, candidates.length),
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

let bookLevel7CandidateCache = null;

export function bookLevel7CandidateValues() {
  if (bookLevel7CandidateCache) {
    return bookLevel7CandidateCache;
  }

  const minValue = 1;
  const maxValue = 20;
  const candidates = [];
  for (let t0 = minValue; t0 <= maxValue; t0 += 1) {
    for (let t1 = minValue; t1 <= maxValue; t1 += 1) {
      for (let b1 = minValue; b1 <= maxValue; b1 += 1) {
        for (let b2 = minValue; b2 <= maxValue; b2 += 1) {
          const values = bookLevel7Values({ t0, t1, b1, b2 });
          if (bookLevel7ValuesAreInDomain(values, minValue, maxValue)) {
            candidates.push(values);
          }
        }
      }
    }
  }

  bookLevel7CandidateCache = candidates;
  return bookLevel7CandidateCache;
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

function bookLevel7Values({ t0, t1, b1, b2 }) {
  const values = {
    t0,
    t1,
    t2: 2 * t1 - t0,
    t3: 3 * t1 - 2 * t0,
    b1,
    b2,
    b0: 2 * b1 - b2,
    b3: 2 * b2 - b1,
  };
  values.m0 = (values.t2 + values.b2) / 2;
  values.m1 = (values.t3 + values.b3) / 2;
  values.m2 = 2 * values.m1 - values.m0;
  values.m3 = 3 * values.m1 - 2 * values.m0;
  return values;
}

function bookLevel7CandidateIsValid(problem, values, minValue, maxValue) {
  for (const node of problem.nodes) {
    const value = values[node.id];
    if (!valueIsInDomain(value, minValue, maxValue)) {
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

function bookLevel7ValuesAreInDomain(values, minValue, maxValue) {
  const nodeIds = ["t0", "t1", "t2", "t3", "m0", "m1", "m2", "m3", "b0", "b1", "b2", "b3"];
  return nodeIds.every((nodeId) => valueIsInDomain(values[nodeId], minValue, maxValue));
}

function valueIsInDomain(value, minValue, maxValue) {
  return Number.isInteger(value) && value >= minValue && value <= maxValue;
}

function bookLevel7TextSteps(problem, values, candidateCount, minValue, maxValue) {
  const givenText = Object.entries(givenValues(problem))
    .map(([nodeId, value]) => `${nodeId} = ${value}`)
    .join(", ");
  return [
    `初期配置では、2つ分かっていて1つ決まる3マス組は ${readyRuns(problem, givenValues(problem)).length} 箇所です。`,
    `このレベルでは、${minValue}〜${maxValue} の整数という範囲も使います。`,
    `ヒントは ${givenText} です。`,
    `線の条件をすべて満たす盤面候補を作り、ヒントと合うものだけ残すと ${candidateCount} 通りです。`,
    candidateCount === 1
      ? `残った候補は1通りなので、t1 = ${values.t1}, b2 = ${values.b2} と決まります。`
      : "候補が1通りではないため、このヒント配置だけでは解答を一意に決められません。",
    candidateCount === 1
      ? "そこから上段・下段・中央の等差条件で、残りのマスもすべて決まります。"
      : "ヒントを増やすか、別のヒント配置にする必要があります。",
  ];
}

function bookLevel7Explanation(problem, values, candidateCount) {
  const givenText = Object.entries(givenValues(problem))
    .map(([nodeId, value]) => `${nodeId} = ${value}`)
    .join(", ");
  return [
    "この問題は、通常の「2つ分かれば1つ決まる」だけでは初手がありません。",
    "そのため、1〜20の整数範囲と、すべての線の等差条件を合わせて使います。",
    `ヒント ${givenText} に合う盤面候補は ${candidateCount} 通りです。`,
    candidateCount === 1
      ? `候補が1通りだけなので、t1 = ${values.t1}, b2 = ${values.b2} から解答が一意に決まります。`
      : "候補が1通りではないため、このままでは解答を一意に決められません。",
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
