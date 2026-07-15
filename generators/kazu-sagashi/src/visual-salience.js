export const NEUMANN_VISUAL_MODELS = Object.freeze([
  Object.freeze({ id: "rough-order", label: "粗い大小関係", metric: "visualRoughOrderExpectedRank" }),
  Object.freeze({ id: "order-density", label: "大小関係と密度", metric: "visualOrderDensityExpectedRank" }),
  Object.freeze({ id: "shape-density", label: "塊と密度", metric: "visualShapeDensityExpectedRank" }),
  Object.freeze({ id: "combined", label: "大小・塊・密度", metric: "visualCombinedExpectedRank" }),
]);

export function evaluateNeumannVisualSalience(windows, answerWindow) {
  const ranks = NEUMANN_VISUAL_MODELS.map((model) => rankByModel(windows, answerWindow, model));
  return {
    ranks,
    metrics: {
      ...Object.fromEntries(ranks.map((rank) => [rank.metric, rank.expectedRank])),
      visualMinimumExpectedRank: Math.min(...ranks.map((rank) => rank.expectedRank)),
    },
  };
}

export function scoreNeumannVisualModel(window, modelId) {
  const apple = value(window, "apple");
  const pear = value(window, "pear");
  const orange = value(window, "orange");
  const total = value(window, "total");
  const cluster = value(window, "cluster");
  const roughOrder = Number(apple >= 1 && apple <= pear) + Number(pear >= 1 && pear <= orange);
  if (modelId === "rough-order") return roughOrder;
  if (modelId === "order-density") return roughOrder * 10 + coarseDensity(total);
  if (modelId === "shape-density") return coarseCluster(cluster) * 3 + coarseDensity(total);
  if (modelId === "combined") return roughOrder * 10 + coarseCluster(cluster) + coarseDensity(total);
  throw new RangeError(`未対応の視覚モデルです: ${modelId}`);
}

function rankByModel(windows, answerWindow, model) {
  const answerScore = scoreNeumannVisualModel(answerWindow, model.id);
  const better = windows.filter((window) => scoreNeumannVisualModel(window, model.id) > answerScore).length;
  const tied = windows.filter((window) => scoreNeumannVisualModel(window, model.id) === answerScore).length;
  return {
    ...model,
    bestRank: better + 1,
    expectedRank: better + (tied + 1) / 2,
    worstRank: better + tied,
  };
}

function value(window, key) {
  if (key === "apple") return window.appleCount ?? window.apple;
  if (key === "pear") return window.pearCount ?? window.pear;
  if (key === "orange") return window.orangeCount ?? window.orange;
  if (key === "total") return window.totalFruitCount ?? window.total;
  if (key === "cluster") return window.largestOccupiedCluster ?? window.cluster;
  throw new RangeError(`未対応の視覚特徴です: ${key}`);
}

function coarseCluster(value) {
  if (value <= 2) return 0;
  if (value <= 5) return 1;
  return 2;
}

function coarseDensity(value) {
  if (value <= 3) return 0;
  if (value <= 6) return 1;
  return 2;
}
