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
        <span class="problem-level">${problem.levelLabel ? `レベル: ${escapeHtml(problem.levelLabel)}` : `レベル${problem.level}`}</span>
      </header>
      <h3>${renderQuestion(problem)}</h3>
      ${renderQuestionLegend(problem, answerMode)}
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
      const kind = isMultiFruitMode(problem.mode) ? problem.grid.cellStates[value] : "apple-count";
      const answerClasses = answerMode ? answerEdgeClasses(problem.answer, row, col) : "";
      cells.push(
        `<div class="number-cell${answerClasses}" data-row="${row}" data-col="${col}" data-cell-value="${value}" data-fruit-kind="${kind}" data-fruit-count="${isMultiFruitMode(problem.mode) ? (value === 0 ? 0 : 1) : value}">${fruits}</div>`
      );
    }
  }

  const answerFrame = answerMode
    ? `<span class="answer-frame" data-answer-row="${problem.answer.row}" data-answer-col="${problem.answer.col}" hidden aria-hidden="true"></span>`
    : "";
  const aria = answerMode
    ? `${size}かける${size}の盤面。正解の3かける3の枠を表示しています。`
    : `${size}かける${size}の盤面から、${questionText(problem)}。`;
  return `<div class="number-board" role="img" aria-label="${escapeHtml(aria)}" style="--grid-size:${size}">${cells.join("")}${answerFrame}</div>`;
}

function answerEdgeClasses(answer, row, col) {
  if (row < answer.row || row > answer.row + 2 || col < answer.col || col > answer.col + 2) return "";
  const classes = [" answer-cell"];
  if (row === answer.row) classes.push("answer-edge-top");
  if (row === answer.row + 2) classes.push("answer-edge-bottom");
  if (col === answer.col) classes.push("answer-edge-left");
  if (col === answer.col + 2) classes.push("answer-edge-right");
  return classes.join(" ");
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
        <td>${metrics.totalAppleCount} / ${metrics.totalPearCount} / ${metrics.totalOrangeCount ?? 0}</td>
        <td>${percent(metrics.occupiedCellDensity)}</td>
        <td>${metrics.restartCount} / ${metrics.repairStepCount}</td>
      </tr>`;
    })
    .join("");
  return `
    <div class="metrics-table-wrap">
      <table class="metrics-table">
        <thead><tr><th>問</th><th>Lv</th><th>条件</th><th>盤面</th><th>候補枠</th><th>近似</th><th>隣接</th><th>リンゴ / ナシ / ミカン</th><th>占有</th><th>再始動 / 修復</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderCellValue(mode, value) {
  if (isMultiFruitMode(mode)) {
    if (value === 1) return fruitInstance("apple", 50, 52, 1, 1);
    if (value === 2) return fruitInstance("pear", 50, 54, 1, 1);
    if (value === 3) return fruitInstance("orange", 50, 52, 1, 1);
    return "";
  }
  if (value === 0) return "";
  const centers = value === 1 ? [50] : [38, 62];
  const size = value === 1 ? 52 : 38;
  return centers.map((center, index) => fruitInstance("apple", center, size, index + 1, value)).join("");
}

function fruitInstance(kind, center, size, index, count) {
  const drawing = fruitDrawing(kind);
  return `<span
    class="fruit-instance fruit-count-${count} fruit-kind-${kind}"
    data-fruit-instance="${index}"
    data-center-x="${center}"
    data-fruit-symbol="${kind}"
    style="--fruit-center-x:${center}%;--fruit-size:${size}%"
    aria-hidden="true"
  ><svg class="fruit-icon ${kind}-icon" data-fruit-icon="${kind === "apple" ? "bitten-apple" : kind}" viewBox="0 0 100 100" focusable="false" aria-hidden="true">${drawing}</svg></span>`;
}

function fruitDrawing(kind) {
  if (kind === "apple") {
    return `<path class="fruit-logo-stem" d="M49 28 C49 19 53 13 60 9" /><path class="fruit-silhouette" d="M50 32 C44 24 33 20 24 26 C11 35 12 56 22 75 C29 89 40 96 50 90 C59 96 69 90 77 77 C81 71 84 66 86 63 C80 60 77 56 77 51 C77 46 81 42 87 40 C84 29 75 22 65 24 C58 25 53 29 50 32 Z" /><path class="fruit-logo-leaf" d="M55 20 C58 11 66 7 75 9 C72 17 65 22 56 22 Z" />`;
  }
  if (kind === "pear") {
    return `<path class="pear-stem" d="M51 24 C51 16 55 11 61 8" /><path class="pear-silhouette" d="M50 20 C43 31 44 37 34 45 C21 55 20 72 30 84 C40 96 62 96 72 84 C82 72 79 55 66 45 C56 37 57 31 50 20 Z" /><g class="pear-print-tone" data-print-tone="dots"><circle cx="38" cy="50" r="1.8" /><circle cx="50" cy="50" r="1.8" /><circle cx="62" cy="50" r="1.8" /><circle cx="32" cy="61" r="1.8" /><circle cx="44" cy="61" r="1.8" /><circle cx="56" cy="61" r="1.8" /><circle cx="68" cy="61" r="1.8" /><circle cx="34" cy="72" r="1.8" /><circle cx="46" cy="72" r="1.8" /><circle cx="58" cy="72" r="1.8" /><circle cx="70" cy="72" r="1.8" /><circle cx="40" cy="83" r="1.8" /><circle cx="52" cy="83" r="1.8" /><circle cx="64" cy="83" r="1.8" /></g><path class="pear-leaf" d="M57 18 C62 10 70 8 78 12 C73 19 66 22 58 21 Z" />`;
  }
  if (kind === "orange") {
    return `<circle class="orange-silhouette" cx="50" cy="56" r="34" /><path class="orange-stem" d="M49 24 C48 17 51 12 57 8" /><path class="orange-leaf" d="M54 20 C61 10 71 9 80 14 C73 22 64 25 55 23 Z" /><g class="orange-print-tone" data-print-tone="segments"><path d="M50 25 L50 87" /><path d="M29 34 C44 47 56 66 69 79" /><path d="M71 34 C56 47 44 66 31 79" /></g>`;
  }
  throw new Error(`未対応の果物です: ${kind}`);
}

function questionText(problem) {
  if (problem.mode === "triple-order") {
    return "どのくだものも1こ以上。リンゴ、ナシ、ミカンの順に数が多いところはどこ？";
  }
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

function renderQuestion(problem) {
  if (problem.mode === "triple-order") {
    return "どのくだものも1こ<ruby>以上<rt>いじょう</rt></ruby>。リンゴ、ナシ、ミカンの<ruby>順<rt>じゅん</rt></ruby>に<ruby>数<rt>かず</rt></ruby>が<ruby>多い<rt>おおい</rt></ruby>ところはどこ？";
  }
  if (problem.mode !== "pair-relation") {
    return escapeHtml(questionText(problem));
  }
  if (problem.rule.relation === "equal") {
    return "リンゴとナシが<ruby>同じ<rt>おなじ</rt></ruby><ruby>数<rt>かず</rt></ruby>はどこ？";
  }
  return "リンゴがナシより<ruby>少ない<rt>すくない</rt></ruby>のはどこ？";
}

function renderQuestionLegend(problem, answerMode) {
  return problem.mode === "triple-order" && !answerMode ? renderOrderLegend() : "";
}

function renderOrderLegend() {
  return `<div class="order-hint" aria-label="リンゴよりナシが多い。ナシよりミカンが多い。">
    <span class="order-comparison">${legendFruit("apple", "リンゴ")}<span class="comparison-word">より</span>${legendFruit("pear", "ナシ")}<span class="comparison-word">が<ruby>多い<rt>おおい</rt></ruby></span></span>
    <span class="order-comparison">${legendFruit("pear", "ナシ")}<span class="comparison-word">より</span>${legendFruit("orange", "ミカン")}<span class="comparison-word">が<ruby>多い<rt>おおい</rt></ruby></span></span>
  </div>`;
}

function legendFruit(kind, label) {
  return `<span class="order-fruit order-fruit-${kind}">
    <svg class="order-fruit-icon ${kind}-icon" data-legend-fruit="${kind}" viewBox="0 0 100 100" focusable="false" aria-hidden="true">${fruitDrawing(kind)}</svg>
    <span class="order-fruit-label">${label}</span>
  </span>`;
}

function answerConfirmation(problem) {
  const counts = answerCounts(problem);
  if (problem.mode === "triple-order") return `リンゴ${counts.apple}こ、ナシ${counts.pear}こ、ミカン${counts.orange}こ（じゅんに多い）`;
  if (isPairMode(problem.mode)) return `太枠は リンゴ${counts.apple}こ・ナシ${counts.pear}こ`;
  return `太枠の中は ${counts.apple}こ`;
}

function answerCounts(problem) {
  let apple = 0;
  let pear = 0;
  let orange = 0;
  for (let dy = 0; dy < 3; dy += 1) {
    for (let dx = 0; dx < 3; dx += 1) {
      const value = problem.grid.cells[problem.answer.row + dy][problem.answer.col + dx];
      if (isMultiFruitMode(problem.mode)) {
        if (value === 1) apple += 1;
        if (value === 2) pear += 1;
        if (value === 3) orange += 1;
      } else {
        apple += value;
      }
    }
  }
  return { apple, pear, orange };
}

function ruleLabel(problem) {
  if (problem.mode === "triple-order") return "A < P < O";
  if (problem.mode === "pair-exact") return `A${problem.rule.targetApple} / P${problem.rule.targetPear}`;
  if (problem.mode === "pair-relation") return problem.rule.relation === "equal" ? "A = P" : "A < P";
  return `A = ${problem.rule.targetApple}`;
}

function isPairMode(mode) {
  return mode === "pair-exact" || mode === "pair-relation";
}

function isMultiFruitMode(mode) {
  return isPairMode(mode) || mode === "triple-order";
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
