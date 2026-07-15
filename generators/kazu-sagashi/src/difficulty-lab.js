import { renderBoardHtml } from "./renderer.js?v=8";
import { probabilityGreater, quantile, summarizeLevel } from "./difficulty-solvers.js?v=2";

const state = { worker: null, startedAt: 0 };

function init() {
  const form = document.getElementById("labForm");
  const seedInput = document.getElementById("seedPrefix");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    startRun();
  });
  document.getElementById("cancelButton").addEventListener("click", () => stopRun("中止しました"));
  document.getElementById("newSeedButton").addEventListener("click", () => {
    seedInput.value = randomUiSeed();
    if (!state.worker) setStatus("新しいseedを設定しました", "idle");
  });
}

function randomUiSeed() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const randomHex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `ks-${randomHex}-001`;
}

function startRun() {
  const levels = [...document.querySelectorAll('input[name="level"]:checked')].map((input) => Number(input.value));
  const sampleCount = Number(document.getElementById("sampleCount").value);
  const seedPrefix = document.getElementById("seedPrefix").value.trim();
  if (levels.length === 0) return setStatus("レベルを1つ以上選んでください", "error");
  if (!seedPrefix) return setStatus("seed接頭辞を入力してください", "error");

  stopWorkerOnly();
  state.worker = new Worker(new URL("./difficulty-worker.js?v=1", import.meta.url), { type: "module" });
  state.startedAt = performance.now();
  state.worker.addEventListener("message", handleWorkerMessage);
  state.worker.addEventListener("error", (event) => finishWithError(event.message));
  state.worker.postMessage({ type: "run", levels, sampleCount, seedPrefix });
  setRunning(true);
  setStatus("評価中", "running");
  document.getElementById("progressBlock").hidden = false;
  updateProgress(0, levels.length * sampleCount, 0);
  document.getElementById("summaryCaption").textContent = `${levels.map(levelLabel).join("・")}を各${formatNumber(sampleCount)}問評価中…`;
}

function handleWorkerMessage(event) {
  const data = event.data;
  if (data.type === "progress") {
    updateProgress(data.completed, data.total, data.elapsedMs);
    return;
  }
  if (data.type === "error") {
    finishWithError(data.message);
    return;
  }
  if (data.type === "done") finishRun(data);
}

function finishRun({ records, easiestByLevel, elapsedMs }) {
  stopWorkerOnly();
  setRunning(false);
  setStatus("評価完了", "done");
  const groups = groupByLevel(records);
  const summaries = [...groups.values()].map(summarizeLevel);
  renderSummary(summaries, groups, elapsedMs);
  renderDistribution(groups);
  renderGallery(easiestByLevel);
  document.getElementById("summaryCaption").textContent = `${formatNumber(records.length)}問 / ${(elapsedMs / 1000).toFixed(1)}秒 / seedは再現可能`;
}

function finishWithError(message) {
  stopWorkerOnly();
  setRunning(false);
  setStatus("評価エラー", "error");
  document.getElementById("summaryOutput").innerHTML = `<div class="lab-error" role="alert">${escapeHtml(message)}</div>`;
}

function stopRun(message) {
  stopWorkerOnly();
  setRunning(false);
  setStatus(message, "idle");
}

function stopWorkerOnly() {
  if (state.worker) state.worker.terminate();
  state.worker = null;
}

function setRunning(running) {
  document.getElementById("runButton").disabled = running;
  document.getElementById("cancelButton").disabled = !running;
}

function setStatus(text, kind) {
  const status = document.getElementById("runStatus");
  status.textContent = text;
  status.dataset.kind = kind;
}

function updateProgress(completed, total, elapsedMs) {
  document.getElementById("progressText").textContent = `${formatNumber(completed)} / ${formatNumber(total)}`;
  const progress = document.getElementById("progressBar");
  progress.max = total;
  progress.value = completed;
  const eta = completed > 0 ? elapsedMs * (total - completed) / completed : null;
  document.getElementById("progressEta").textContent = eta === null ? "準備中" : `残り目安 ${formatDuration(eta)}`;
}

function renderSummary(summaries, groups, elapsedMs) {
  const allCosts = [...groups.values()].flatMap((records) => records.map((record) => record.bestExpectedCost)).sort(numericSort);
  const rows = summaries.map((summary) => {
    const relativeScore = percentileRank(allCosts, summary.costMedian);
    return `<tr>
      <th scope="row">${escapeHtml(levelLabel(summary.level))}</th>
      <td>${formatNumber(summary.sampleCount)}</td>
      <td><strong>${relativeScore.toFixed(0)}</strong><span class="score-suffix"> / 100</span></td>
      <td>${formatDecimal(summary.costMedian)}</td>
      <td>${formatDecimal(summary.costP10)}–${formatDecimal(summary.costP90)}</td>
      <td>${formatDecimal(summary.rankMedian)}</td>
      <td>${formatPercent(summary.visualRank1Rate)}</td>
      <td>${formatPercent(summary.visualRank2Rate)}</td>
      <td>${escapeHtml(summary.winnerLabel)} <small>${formatPercent(summary.winnerRate)}</small></td>
      <td>${formatDecimal(summary.generationP95Ms)} ms</td>
    </tr>`;
  }).join("");

  document.getElementById("summaryOutput").innerHTML = `<div class="lab-table-wrap"><table class="lab-table">
    <thead><tr><th>レベル</th><th>問題数</th><th>相対スコア</th><th>コスト中央値</th><th>P10–P90</th><th>順位中央値</th><th>見た目1位</th><th>見た目2位以内</th><th>最頻の最短解法</th><th>生成P95</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <p class="table-footnote">相対スコアは今回選択した全問題のコスト分布における中央値の位置です。選ぶレベルが変わると値も変わります。総実行時間 ${(elapsedMs / 1000).toFixed(1)}秒。</p>`;

  renderSeparation(groups);
}

function renderSeparation(groups) {
  const level6 = groups.get(6);
  const level7 = groups.get(7);
  const output = document.getElementById("separationOutput");
  if (!level6 || !level7) {
    output.innerHTML = "";
    return;
  }
  const comparison = probabilityGreater(
    level7.map((record) => record.bestExpectedCost),
    level6.map((record) => record.bestExpectedCost)
  );
  output.innerHTML = `<div class="separation-card">
    <div><span>LEVEL SEPARATION</span><strong>${formatPercent(comparison.greater)}</strong></div>
    <p>ランダムに1問ずつ選んだとき、ノイマンの操作コストがレベル6より高い確率。等コストは ${formatPercent(comparison.tied)}。</p>
  </div>`;
}

function renderDistribution(groups) {
  const values = [...groups.values()].flatMap((records) => records.map((record) => record.bestExpectedCost));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binCount = 14;
  const span = Math.max(1, max - min);
  const groupHistograms = [...groups.entries()].map(([level, records]) => {
    const bins = Array(binCount).fill(0);
    for (const record of records) {
      const index = Math.min(binCount - 1, Math.floor((record.bestExpectedCost - min) / span * binCount));
      bins[index] += 1;
    }
    return { level, bins: bins.map((count) => count / records.length) };
  });
  const peak = Math.max(...groupHistograms.flatMap((group) => group.bins));
  const bars = groupHistograms.map(({ level, bins }) => `<div class="histogram-row">
    <div class="histogram-label">${escapeHtml(levelLabel(level))}</div>
    <div class="histogram-bars" style="--histogram-color:${levelColor(level)}">
      ${bins.map((value, index) => `<span style="--bar-height:${Math.max(1, value / peak * 100)}%" title="${binLabel(min, span, binCount, index)}: ${formatPercent(value)}"></span>`).join("")}
    </div>
  </div>`).join("");
  document.getElementById("chartOutput").innerHTML = `<div class="histogram">${bars}
    <div class="histogram-axis"><span>${formatDecimal(min)}</span><span>操作コスト →</span><span>${formatDecimal(max)}</span></div>
  </div>`;
}

function renderGallery(easiestByLevel) {
  const cards = Object.entries(easiestByLevel).flatMap(([level, items]) =>
    items.slice(0, 3).map(({ result, problem }, index) => `<article class="audit-card">
      <header><div><span>${escapeHtml(levelLabel(Number(level)))} / EASY ${index + 1}</span><strong>${escapeHtml(problem.problemId)}</strong></div><b>${formatDecimal(result.bestExpectedCost)} cost</b></header>
      ${renderBoardHtml(problem, { answer: true })}
      <dl>
        <div><dt>最短解法</dt><dd>${escapeHtml(result.bestSolverLabel)}</dd></div>
        <div><dt>期待順位</dt><dd>${formatDecimal(result.bestExpectedRank)} / ${result.candidateWindowCount}</dd></div>
        <div><dt>見た目順位</dt><dd>${formatDecimal(result.visualExpectedRank)}</dd></div>
      </dl>
      <details><summary>解法別の内訳</summary>${solverTable(result.solvers)}</details>
    </article>`)
  ).join("");
  document.getElementById("galleryOutput").innerHTML = `<div class="audit-grid">${cards}</div>`;
}

function solverTable(solvers) {
  return `<table class="solver-table"><thead><tr><th>解法</th><th>順位</th><th>枠</th><th>観察セル</th><th>数える</th><th>比較</th><th>数え直し</th><th>コスト</th></tr></thead><tbody>${solvers.map((solver) => `<tr>
    <th>${escapeHtml(solver.label)}</th><td>${rankRange(solver)}</td><td>${formatDecimal(solver.operations.windowsChecked)}</td><td>${formatDecimal(solver.operations.cellObservations)}</td><td>${formatDecimal(solver.operations.fruitCountOps)}</td><td>${formatDecimal(solver.operations.comparisons)}</td><td>${formatDecimal(solver.operations.recounts)}</td><td>${formatDecimal(solver.expectedCost)}</td>
  </tr>`).join("")}</tbody></table>`;
}

function rankRange(solver) {
  return solver.bestRank === solver.worstRank
    ? formatDecimal(solver.expectedRank)
    : `${formatDecimal(solver.bestRank)}–${formatDecimal(solver.worstRank)} (${formatDecimal(solver.expectedRank)})`;
}

function groupByLevel(records) {
  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record.level)) groups.set(record.level, []);
    groups.get(record.level).push(record);
  }
  return groups;
}

function percentileRank(sortedValues, value) {
  let below = 0;
  let equal = 0;
  for (const candidate of sortedValues) {
    if (candidate < value) below += 1;
    else if (candidate === value) equal += 1;
  }
  return sortedValues.length <= 1 ? 50 : (below + equal / 2) / sortedValues.length * 100;
}

function binLabel(min, span, binCount, index) {
  const start = min + span * index / binCount;
  const end = min + span * (index + 1) / binCount;
  return `${formatDecimal(start)}–${formatDecimal(end)}`;
}

function levelLabel(level) {
  return level === 7 ? "ノイマン" : `レベル${level}`;
}

function levelColor(level) {
  return ["#69865a", "#678a81", "#5e7895", "#7c6b99", "#a36f74", "#bc744e", "#b34334"][level - 1];
}

function formatNumber(value) { return new Intl.NumberFormat("ja-JP").format(value); }
function formatDecimal(value) { return Number(value).toFixed(value >= 100 ? 0 : 1); }
function formatPercent(value) { return `${(value * 100).toFixed(1)}%`; }
function formatDuration(ms) { return ms < 60_000 ? `${Math.ceil(ms / 1000)}秒` : `${Math.ceil(ms / 60_000)}分`; }
function numericSort(left, right) { return left - right; }
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

document.addEventListener("DOMContentLoaded", init);
