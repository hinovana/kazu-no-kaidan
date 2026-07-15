import { buildProblem, buildWorksheet } from "./generator.js?v=6";
import { renderMetrics, renderWorksheet } from "./renderer.js?v=9";

function init() {
  const levelSelect = document.getElementById("levelSelect");
  const countSelect = document.getElementById("countSelect");
  const seedInput = document.getElementById("seedInput");
  const generateButton = document.getElementById("generateButton");
  const newSeedButton = document.getElementById("newSeedButton");
  const printButton = document.getElementById("printButton");

  const params = new URLSearchParams(window.location.search);
  if (params.has("level") && [...levelSelect.options].some((option) => option.value === params.get("level"))) {
    levelSelect.value = params.get("level");
  }
  if (params.has("count")) countSelect.value = params.get("count");
  seedInput.value = params.get("seed") || "kazu-sagashi";

  const generate = () => {
    const level = Number(levelSelect.value);
    const count = Number(countSelect.value);
    const seed = seedInput.value.trim();
    try {
      const problems = count === 1 ? [buildProblem(level, seed)] : buildWorksheet(level, seed, { questionCount: count });
      renderResult(problems, seed);
      const nextParams = new URLSearchParams({ level: String(level), count: String(count), seed });
      history.replaceState(null, "", `${window.location.pathname}?${nextParams}`);
    } catch (error) {
      renderError(level, count, seed, error);
    }
  };

  generateButton.addEventListener("click", generate);
  levelSelect.addEventListener("change", generate);
  countSelect.addEventListener("change", generate);
  seedInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") generate();
  });
  newSeedButton.addEventListener("click", () => {
    seedInput.value = randomUiSeed();
    generate();
  });
  printButton.addEventListener("click", () => window.print());
  generate();
}

function renderResult(problems, seed) {
  document.getElementById("problemOutput").innerHTML = renderWorksheet(problems);
  document.getElementById("answerOutput").innerHTML = renderWorksheet(problems, { answer: true });
  document.getElementById("metricsOutput").innerHTML = renderMetrics(problems);
  const levels = [...new Set(problems.map((problem) => problem.levelLabel || problem.level))].join(", ");
  document.getElementById("statusText").textContent =
    `${problems.length}問 / レベル ${levels} / seed: ${seed} / 全問一意解 OK`;
}

function renderError(level, count, seed, error) {
  const details = error?.details ? JSON.stringify(error.details) : "詳細なし";
  document.getElementById("problemOutput").innerHTML = `
    <div class="generation-error" role="alert">
      <p class="error-kicker">生成できません</p>
      <h3>${level === 7 ? "レベル: ノイマン" : `レベル${level}`} / ${count}問 / seed: ${escapeHtml(seed || "(空)")}</h3>
      <p>${escapeHtml(error?.message || String(error))}</p>
      <details><summary>詳細</summary><code>${escapeHtml(details)}</code></details>
    </div>`;
  document.getElementById("answerOutput").innerHTML = "";
  document.getElementById("metricsOutput").innerHTML = "";
  document.getElementById("statusText").textContent = `生成エラー: ${error?.message || error}`;
}

function randomUiSeed() {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `ks-${values[0].toString(36)}-${values[1].toString(36)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

document.addEventListener("DOMContentLoaded", init);
