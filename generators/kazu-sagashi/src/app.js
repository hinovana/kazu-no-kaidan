import { buildProblem, buildWorksheet } from "./generator.js";
import { APPLE_SYMBOL_ID, PEAR_SYMBOL_ID } from "./fruit-symbols.js";
import { renderMetrics, renderWorksheet } from "./renderer.js";

const FRUIT_SPRITE_HTML = `<svg class="fruit-symbol-sprite" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <symbol id="${APPLE_SYMBOL_ID}" viewBox="0 0 100 100">
        <path class="fruit-logo-stem" d="M49 28 C49 19 53 13 60 9" />
        <path class="fruit-silhouette" d="M50 32 C44 24 33 20 24 26 C11 35 12 56 22 75 C29 89 40 96 50 90 C59 96 69 90 77 77 C81 71 84 66 86 63 C80 60 77 56 77 51 C77 46 81 42 87 40 C84 29 75 22 65 24 C58 25 53 29 50 32 Z" />
        <path class="fruit-logo-leaf" d="M55 20 C58 11 66 7 75 9 C72 17 65 22 56 22 Z" />
      </symbol>
      <symbol id="${PEAR_SYMBOL_ID}" viewBox="0 0 100 100">
        <path class="pear-stem" d="M51 24 C51 16 55 11 61 8" />
        <path class="pear-silhouette" d="M50 20 C43 31 44 37 34 45 C21 55 20 72 30 84 C40 96 62 96 72 84 C82 72 79 55 66 45 C56 37 57 31 50 20 Z" />
        <g class="pear-print-tone" data-print-tone="dots">
          <circle cx="38" cy="50" r="1.8" /><circle cx="50" cy="50" r="1.8" /><circle cx="62" cy="50" r="1.8" />
          <circle cx="32" cy="61" r="1.8" /><circle cx="44" cy="61" r="1.8" /><circle cx="56" cy="61" r="1.8" /><circle cx="68" cy="61" r="1.8" />
          <circle cx="34" cy="72" r="1.8" /><circle cx="46" cy="72" r="1.8" /><circle cx="58" cy="72" r="1.8" /><circle cx="70" cy="72" r="1.8" />
          <circle cx="40" cy="83" r="1.8" /><circle cx="52" cy="83" r="1.8" /><circle cx="64" cy="83" r="1.8" />
        </g>
        <path class="pear-leaf" d="M57 18 C62 10 70 8 78 12 C73 19 66 22 58 21 Z" />
      </symbol>
    </defs>
  </svg>`;

function init() {
  document.getElementById("fruitSpriteRoot").innerHTML = FRUIT_SPRITE_HTML;
  const levelSelect = document.getElementById("levelSelect");
  const countSelect = document.getElementById("countSelect");
  const seedInput = document.getElementById("seedInput");
  const generateButton = document.getElementById("generateButton");
  const newSeedButton = document.getElementById("newSeedButton");
  const printButton = document.getElementById("printButton");

  const params = new URLSearchParams(window.location.search);
  if (params.has("level")) levelSelect.value = params.get("level");
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
  const levels = [...new Set(problems.map((problem) => problem.level))].join(", ");
  document.getElementById("statusText").textContent =
    `${problems.length}問 / レベル ${levels} / seed: ${seed} / 全問一意解 OK`;
}

function renderError(level, count, seed, error) {
  const details = error?.details ? JSON.stringify(error.details) : "詳細なし";
  document.getElementById("problemOutput").innerHTML = `
    <div class="generation-error" role="alert">
      <p class="error-kicker">生成できません</p>
      <h3>レベル${level} / ${count}問 / seed: ${escapeHtml(seed || "(空)")}</h3>
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
