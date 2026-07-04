import { buildProblem } from "./engine.js";
import { formatExplanation, renderStepsHtml, renderSvg } from "./render.js";

function newSeed(level, mode) {
  return `level-${level}-${mode}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function renderGenerated(level, mode) {
  let problem;
  let report;
  let metrics;
  try {
    ({ problem, report, metrics } = buildProblem(level, newSeed(level, mode), { mode }));
  } catch (error) {
    renderGenerationError(level, mode, error);
    return;
  }

  document.getElementById("problemSvg").innerHTML = renderSvg(problem, "problem");
  document.getElementById("idMapSvg").innerHTML = renderSvg(problem, "ids");
  document.getElementById("answerSvg").innerHTML = renderSvg(problem, "answer");
  document.getElementById("stepsOutput").innerHTML = renderStepsHtml(problem, report);
  document.getElementById("explanationOutput").innerHTML = formatExplanation(problem, report);
  const modeLabel = metrics.generationMode === "strict" ? "一本道" : "標準";
  const solverLabel = metrics.solver === "book-level7" ? "整数範囲" : modeLabel;
  document.getElementById("statusText").textContent =
    `${problem.problemId} / ${solverLabel} / 初期配置 ${metrics.givenCount}マス / 最大候補 ${metrics.maxReadyCount} / 確定 ${metrics.stepCount}手 / 一意解 OK`;
}

function renderGenerationError(level, mode, error) {
  const modeLabel = mode === "strict" ? "一本道" : "標準";
  const reason = generationErrorReason(level, mode, error);
  const escapedMessage = escapeHtml(error.message);
  const escapedReason = escapeHtml(reason);
  const escapedCondition = escapeHtml(`レベル${level} / ${modeLabel}`);

  document.getElementById("problemSvg").innerHTML = `
    <div class="generation-error" role="alert">
      <p class="error-kicker">生成できません</p>
      <p class="error-title">${escapedCondition}</p>
      <dl>
        <dt>理由</dt>
        <dd>${escapedReason}</dd>
        <dt>エラー</dt>
        <dd>${escapedMessage}</dd>
      </dl>
    </div>
  `;
  document.getElementById("answerSvg").innerHTML = "";
  document.getElementById("idMapSvg").innerHTML = "";
  document.getElementById("stepsOutput").innerHTML = "";
  document.getElementById("explanationOutput").innerHTML = `
    <ul class="explanation-list">
      <li>${escapedReason}</li>
      <li>標準モードに切り替えると、一意解・分岐なし伝播の問題を生成できます。</li>
    </ul>
  `;
  document.getElementById("statusText").textContent = `生成できません: ${error.message}`;
}

function generationErrorReason(level, mode, error) {
  if (mode === "strict" && level === 6) {
    return "レベル6の形では、途中で複数の確定候補が出る配置が必要になります。一本道モードは全ステップで候補1つだけを要求するため、このレベルでは候補を用意していません。";
  }
  if (mode === "strict" && level === 7) {
    return "レベル7は、初期状態では確定候補が0箇所の本の問題です。整数範囲と式整理で解くタイプなので、一本道モードの対象外です。";
  }
  return `指定された条件では採用条件を満たす問題が見つかりませんでした。${error.message}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function init() {
  const levelSelect = document.getElementById("levelSelect");
  const modeSelect = document.getElementById("modeSelect");
  const generateButton = document.getElementById("generateButton");
  const printButton = document.getElementById("printButton");

  const generate = () => renderGenerated(Number(levelSelect.value), modeSelect.value);
  levelSelect.addEventListener("change", generate);
  modeSelect.addEventListener("change", generate);
  generateButton.addEventListener("click", generate);
  printButton.addEventListener("click", () => window.print());
  generate();
}

document.addEventListener("DOMContentLoaded", init);
