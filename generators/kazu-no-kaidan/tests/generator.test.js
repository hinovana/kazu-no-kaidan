import assert from "node:assert/strict";

import { buildProblem } from "../src/generator.js";
import { bookLevel7CandidateValues, givenValues, readyRuns, solveBookLevel7 } from "../src/solver.js";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

function answerSignature(problem) {
  return problem.nodes.map((node) => `${node.id}:${node.answer}`).join("|");
}

function givenSignature(problem) {
  return problem.nodes
    .filter((node) => Object.prototype.hasOwnProperty.call(node, "given"))
    .map((node) => `${node.id}:${node.given}`)
    .sort()
    .join("|");
}

test("level 7 has a finite candidate domain", () => {
  const candidates = bookLevel7CandidateValues();
  assert.equal(candidates.length, 3644);
  for (const values of candidates) {
    for (const value of Object.values(values)) {
      assert.equal(Number.isInteger(value), true);
      assert.equal(value >= 1 && value <= 20, true);
    }
  }
});

test("level 7 is generated from seed-dependent answers and hints", () => {
  const answerSignatures = new Set();
  const givenSignatures = new Set();

  for (let index = 0; index < 20; index += 1) {
    const { problem, report, metrics } = buildProblem(7, `level7-random-${index}`, { mode: "standard" });
    const givens = givenValues(problem);

    assert.equal(problem.level, 7);
    assert.equal(metrics.solver, "book-level7");
    assert.equal(metrics.uniqueSolution, true);
    assert.equal(metrics.domainUniqueSolution, true);
    assert.equal(metrics.answersMatch, true);
    assert.equal(metrics.initialReadyCount, 0);
    assert.equal(metrics.completedRunCount, 0);
    assert.equal(report.candidateCount, 1);
    assert.deepEqual(report.unresolved, []);
    assert.equal(readyRuns(problem, givens).length, 0);

    for (const node of problem.nodes) {
      assert.equal(report.values[node.id], node.answer);
      assert.equal(Number.isInteger(node.answer), true);
      assert.equal(node.answer >= 1 && node.answer <= 20, true);
    }
    const values = Object.fromEntries(problem.nodes.map((node) => [node.id, node.answer]));
    const rowSteps = [values.t1 - values.t0, values.m1 - values.m0, values.b2 - values.b1];
    const allValues = Object.values(values);
    assert.equal(rowSteps.every((step) => step !== 0), true);
    assert.equal(Math.max(...allValues) - Math.min(...allValues) >= 6, true);
    assert.equal(new Set(allValues).size >= 6, true);

    answerSignatures.add(answerSignature(problem));
    givenSignatures.add(givenSignature(problem));
  }

  assert.equal(answerSignatures.size > 1, true);
  assert.equal(givenSignatures.size > 1, true);
});

test("level 7 generation is deterministic for the same seed", () => {
  const first = buildProblem(7, "stable-level7-seed", { mode: "standard" });
  const second = buildProblem(7, "stable-level7-seed", { mode: "standard" });

  assert.equal(answerSignature(first.problem), answerSignature(second.problem));
  assert.equal(givenSignature(first.problem), givenSignature(second.problem));
  assert.equal(first.report.candidateCount, 1);
  assert.equal(second.report.candidateCount, 1);
});

test("level 7 solver rejects non-unique hint sets", () => {
  const { problem } = buildProblem(7, "non-unique-source", { mode: "standard" });
  const weakProblem = {
    ...problem,
    nodes: problem.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, answer: node.answer })),
  };
  weakProblem.nodes.find((node) => node.id === "t0").given = problem.nodes.find((node) => node.id === "t0").answer;

  const report = solveBookLevel7(weakProblem);
  assert.equal(report.uniqueSolution, false);
  assert.equal(report.candidateCount > 1, true);
});
