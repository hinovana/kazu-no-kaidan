import { buildProblem } from "./generator.js?v=5";
import { evaluateProblemDifficulty } from "./difficulty-solvers.js?v=2";

let activeRun = 0;

self.addEventListener("message", (event) => {
  if (event.data?.type !== "run") return;
  const runId = ++activeRun;
  runEvaluation(runId, event.data).catch((error) => {
    self.postMessage({
      type: "error",
      runId,
      message: error?.message || String(error),
      stack: error?.stack || "",
    });
  });
});

async function runEvaluation(runId, { levels, sampleCount, seedPrefix }) {
  const total = levels.length * sampleCount;
  const records = [];
  const easiestByLevel = Object.fromEntries(levels.map((level) => [level, []]));
  const startedAt = performance.now();
  let completed = 0;

  for (const level of levels) {
    for (let index = 0; index < sampleCount; index += 1) {
      if (runId !== activeRun) return;
      const seed = `${seedPrefix}-L${level}-${String(index).padStart(6, "0")}`;
      const generationStartedAt = performance.now();
      const problem = buildProblem(level, seed);
      const generationMs = performance.now() - generationStartedAt;
      const result = { ...evaluateProblemDifficulty(problem), generationMs, seed };
      records.push(compactResult(result));
      retainEasiest(easiestByLevel[level], { result, problem }, 6);
      completed += 1;

      if (completed === total || completed % 10 === 0) {
        self.postMessage({
          type: "progress",
          runId,
          completed,
          total,
          level,
          elapsedMs: performance.now() - startedAt,
        });
        await yieldToEventLoop();
      }
    }
  }

  self.postMessage({
    type: "done",
    runId,
    records,
    easiestByLevel,
    elapsedMs: performance.now() - startedAt,
  });
}

function retainEasiest(items, candidate, limit) {
  items.push(candidate);
  items.sort((left, right) =>
    left.result.bestExpectedCost - right.result.bestExpectedCost
    || left.result.visualExpectedRank - right.result.visualExpectedRank
    || left.result.problemId.localeCompare(right.result.problemId)
  );
  if (items.length > limit) items.length = limit;
}

function compactResult(result) {
  return {
    level: result.level,
    levelLabel: result.levelLabel,
    problemId: result.problemId,
    bestSolverId: result.bestSolverId,
    bestSolverLabel: result.bestSolverLabel,
    bestExpectedCost: result.bestExpectedCost,
    bestExpectedRank: result.bestExpectedRank,
    visualExpectedRank: result.visualExpectedRank,
    generationMs: result.generationMs,
  };
}

function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
