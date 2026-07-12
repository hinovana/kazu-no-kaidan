import { FRUIT_SYMBOL_IDS } from "./fruit-symbols.js";

export function renderWorksheet(problems, options = {}) {
  const answerMode = options.answer === true;
  const cards = problems.map((problem, index) => renderProblemCard(problem, index, answerMode)).join("");
  const sizeClass = problems.length === 1 ? "is-single" : "is-pack";
  return `<div class="worksheet-list ${sizeClass}" data-answer-mode="${answerMode}">${cards}</div>`;
}

export function renderProblemCard(problem, index = 0, answerMode = false) {
  const label = answerMode ? `解答 ${index + 1}` : `問題 ${index + 1}`;
  return `
    <article class="worksheet-card" data-problem-id="${escapeHtml(problem.problemId)}">
      <header class="worksheet-card-header">
        <span class="problem-number">${label}</span>
        <span class="problem-level">レベル${problem.level}</span>
      </header>
      <h3>${escapeHtml(questionText(problem))}</h3>
      ${renderBoardHtml(problem, { answer: answerMode })}
      <footer class="worksheet-card-footer">
        <span>${problem.grid.rows} × ${problem.grid.cols}</span>
        <span>${escapeHtml(problem.problemId)}</span>
        ${answerMode ? `<strong>${escapeHtml(answerConfirmation(problem))}</strong>` : ""}
      </footer>
    </article>
  `;
}

export function renderBoardHtml(problem, options = {}) {
  const answerMode = options.answer === true;
  const size = problem.grid.rows;
  const cells = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const value = problem.grid.cells[row][col];
      const fruits = renderCellValue(problem.mode, value);
      const kind = isPairMode(problem.mode) ? ["empty", "apple", "pear"][value] : "apple-count";
      cells.push(
        `<div class="number-cell" data-row="${row}" data-col="${col}" data-cell-value="${value}" data-fruit-kind="${kind}" data-fruit-count="${isPairMode(problem.mode) ? (value === 0 ? 0 : 1) : value}">${fruits}</div>`
      );
    }
  }

  const answerFrame = answerMode
    ? `<div class="answer-frame" data-answer-row="${problem.answer.row}" data-answer-col="${problem.answer.col}" style="--answer-row:${problem.answer.row};--answer-col:${problem.answer.col}" aria-hidden="true"></div>`
    : "";
  const aria = answerMode
    ? `${size}かける${size}の盤面。正解の3かける3の枠を表示しています。`
    : `${size}かける${size}の盤面から、${questionText(problem)}。`;
  return `<div class="number-board" role="img" aria-label="${escapeHtml(aria)}" style="--grid-size:${size}">${cells.join("")}${answerFrame}</div>`;
}

export function renderMetrics(problems) {
  const rows = problems
    .map((problem, index) => {
      const metrics = problem.metrics;
      return `<tr>
        <th scope="row">${index + 1}</th>
        <td>${problem.level}</td>
        <td>${escapeHtml(ruleLabel(problem))}</td>
        <td>${problem.grid.rows} × ${problem.grid.cols}</td>
        <td>${metrics.candidateWindowCount}</td>
        <td>${metrics.nearMissCount}</td>
        <td>${metrics.adjacentNearMissCount}</td>
        <td>${metrics.totalAppleCount} / ${metrics.totalPearCount}</td>
        <td>${percent(metrics.occupiedCellDensity)}</td>
        <td>${metrics.restartCount} / ${metrics.repairStepCount}</td>
      </tr>`;
    })
    .join("");
  return `
    <div class="metrics-table-wrap">
      <table class="metrics-table">
        <thead><tr><th>問</th><th>Lv</th><th>条件</th><th>盤面</th><th>候補枠</th><th>近似</th><th>隣接</th><th>リンゴ / ナシ</th><th>占有</th><th>再始動 / 修復</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderCellValue(mode, value) {
  if (isPairMode(mode)) {
    if (value === 1) return fruitInstance("apple", 50, 52, 1, 1);
    if (value === 2) return fruitInstance("pear", 50, 54, 1, 1);
    return "";
  }
  if (value === 0) return "";
  const centers = value === 1 ? [50] : [38, 62];
  const size = value === 1 ? 52 : 38;
  return centers.map((center, index) => fruitInstance("apple", center, size, index + 1, value)).join("");
}

function fruitInstance(kind, center, size, index, count) {
  const symbolId = FRUIT_SYMBOL_IDS[kind];
  if (!symbolId) throw new Error(`未対応の果物です: ${kind}`);
  return `<span
    class="fruit-instance fruit-count-${count} fruit-kind-${kind}"
    data-fruit-instance="${index}"
    data-center-x="${center}"
    data-fruit-symbol="${kind}"
    style="--fruit-center-x:${center}%;--fruit-size:${size}%"
    aria-hidden="true"
  ><svg class="fruit-icon ${kind}-icon" data-fruit-icon="${kind === "apple" ? "bitten-apple" : "pear"}" viewBox="0 0 100 100" focusable="false" aria-hidden="true"><use href="#${symbolId}" /></svg></span>`;
}

function questionText(problem) {
  if (problem.mode === "pair-exact") {
    return `リンゴ${problem.rule.targetApple}こ・ナシ${problem.rule.targetPear}こはどこ？`;
  }
  if (problem.mode === "pair-relation") {
    return problem.rule.relation === "equal"
      ? "リンゴとナシが同じ数はどこ？"
      : "リンゴがナシより少ないのはどこ？";
  }
  return `${problem.rule.targetApple}こはどこ？`;
}

function answerConfirmation(problem) {
  const counts = answerCounts(problem);
  if (isPairMode(problem.mode)) return `太枠は リンゴ${counts.apple}こ・ナシ${counts.pear}こ`;
  return `太枠の中は ${counts.apple}こ`;
}

function answerCounts(problem) {
  let apple = 0;
  let pear = 0;
  for (let dy = 0; dy < 3; dy += 1) {
    for (let dx = 0; dx < 3; dx += 1) {
      const value = problem.grid.cells[problem.answer.row + dy][problem.answer.col + dx];
      if (isPairMode(problem.mode)) {
        if (value === 1) apple += 1;
        if (value === 2) pear += 1;
      } else {
        apple += value;
      }
    }
  }
  return { apple, pear };
}

function ruleLabel(problem) {
  if (problem.mode === "pair-exact") return `A${problem.rule.targetApple} / P${problem.rule.targetPear}`;
  if (problem.mode === "pair-relation") return problem.rule.relation === "equal" ? "A = P" : "A < P";
  return `A = ${problem.rule.targetApple}`;
}

function isPairMode(mode) {
  return mode === "pair-exact" || mode === "pair-relation";
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
