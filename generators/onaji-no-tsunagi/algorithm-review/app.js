(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const CLASSIFICATION_COLUMNS = [
    ["clearly_easier", "明らかに簡単側"],
    ["reference_like", "原本近傍"],
    ["clearly_harder", "明らかに難しい側"],
    ["mixed_easier", "指標混合: 簡単寄り"],
    ["mixed_harder", "指標混合: 難しい寄り"],
  ];
  const CANDIDATE_GROUPS = [
    ["clearlyEasier", "明らかに簡単側"],
    ["referenceLike", "原本近傍"],
    ["clearlyHarder", "明らかに難しい側"],
    ["mixedEasyEdge", "混合指標・簡単側の端"],
    ["mixedHardEdge", "混合指標・難しい側の端"],
    ["representativeFill", "分布全体からの補完標本"],
  ];
  const CLASSIFICATION_LABELS = Object.fromEntries(CLASSIFICATION_COLUMNS);
  const METRICS = [
    ["entryHypothesisCount", "初期選択肢量"],
    ["forcedExitCount", "強制出口"],
    ["solverStateCount", "solver状態"],
    ["solverBacktrackCount", "backtrack"],
    ["totalTurnCount", "曲がり"],
    ["usedCellCount", "使用マス"],
    ["maximumLineConcentration", "同一行・列の端点上限"],
    ["pairingChoiceCount", "ペア候補"],
  ];

  const reportTitle = document.querySelector("#report-title");
  const reportRoot = document.querySelector("#report-root");
  const loadPanel = document.querySelector("#load-panel");
  const loadStatus = document.querySelector("#load-status");
  const dialog = document.querySelector("#candidate-dialog");
  const dialogContent = document.querySelector("#dialog-content");

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  const defaultReportFile =
    document.documentElement.dataset.defaultReport ?? "";
  const reportFile =
    new URL(window.location.href).searchParams.get("report") ??
    defaultReportFile;
  if (isSafeReportFileName(reportFile)) {
    void loadFromUrl(`./data/${encodeURIComponent(reportFile)}`);
  } else {
    showError(
      new Error(
        "reportにはdataディレクトリ内のJSONファイル名だけを指定してください。",
      ),
    );
  }

  async function loadFromUrl(dataUrl) {
    if (window.location.protocol === "file:") {
      setStatus(
        "このテンプレートはローカルサーバー経由で開いてください。README.mdの serve.sh を使用できます。",
        true,
      );
      return;
    }
    setStatus(`${dataUrl} を読み込んでいます…`);
    try {
      const response = await fetch(dataUrl);
      if (!response.ok) {
        throw new Error(`JSONの取得に失敗しました（HTTP ${response.status}）。`);
      }
      const report = parseReport(await response.json());
      renderReport(report);
      setStatus(`${dataUrl} を表示しました。`);
    } catch (error) {
      showError(error);
    }
  }

  function parseReport(value) {
    if (!isRecord(value)) {
      throw new Error("JSONのルートはobjectである必要があります。");
    }
    requireString(value, "schemaVersion");
    requireString(value, "reportTitle");
    requireFiniteNumber(value, "totalGenerated");
    if (!Array.isArray(value.conditionViolations)) {
      throw new Error("conditionViolationsが配列ではありません。");
    }
    if (!isRecord(value.allFiltersPassed)) {
      throw new Error("allFiltersPassedがobjectではありません。");
    }
    if (!isRecord(value.byProfile)) {
      throw new Error("byProfileがobjectではありません。");
    }
    return value;
  }

  function renderReport(report) {
    reportTitle.textContent = report.reportTitle;
    document.title = report.reportTitle;
    reportRoot.replaceChildren(
      renderAggregateSection(report),
      ...Object.entries(report.byProfile).map(([label, cohort]) =>
        renderCohortSection(report, label, cohort),
      ),
    );
    loadPanel.hidden = true;
    reportRoot.hidden = false;
  }

  function renderAggregateSection(report) {
    const section = element("section");
    section.append(
      heading(2, "集計", "section-heading"),
      renderSummaryGrid(report),
      renderConditionHeading(report.conditionViolations),
      renderConditionTable(report),
    );
    return section;
  }

  function renderSummaryGrid(report) {
    const grid = element("div", "summary-grid");
    grid.append(
      summaryPanel(
        "通常生成",
        `${formatInteger(report.totalGenerated)}問`,
        "同一seed系列、変形なし",
      ),
      summaryPanel(
        "全filter通過",
        `${formatInteger(report.allFiltersPassed.count)}問`,
        formatPercent(report.allFiltersPassed.rate),
      ),
    );
    if (isRecord(report.timing)) {
      grid.append(
        summaryPanel(
          `${formatInteger(report.totalGenerated)}問の生成時間`,
          `${formatDecimal(report.timing.elapsedSeconds)}秒`,
          `平均 ${formatDecimal(report.timing.averageMsPerPuzzle)}ms / 問`,
        ),
      );
    }
    return grid;
  }

  function renderConditionHeading(conditions) {
    const wrapper = element("div", "heading-with-action");
    wrapper.append(heading(3, "条件ごとの違反問題数と、違反群の分類内訳"));
    const button = element("button", "copy-conditions");
    button.type = "button";
    button.textContent = "条件一覧をコピー";
    button.addEventListener("click", async () => {
      const lines = conditions.map((condition) => `* ${condition.label}`);
      await copyWithFeedback(button, lines.join("\n"), "コピー済み");
    });
    wrapper.append(button);
    return wrapper;
  }

  function renderConditionTable(report) {
    const wrapper = element("div", "table-wrap");
    const table = element("table");
    const thead = element("thead");
    const headerRow = element("tr");
    headerRow.append(
      textCell("th", "条件"),
      textCell("th", `${formatInteger(report.totalGenerated)}問中の問題数`),
      ...CLASSIFICATION_COLUMNS.map(([, label]) => textCell("th", label)),
    );
    thead.append(headerRow);

    const tbody = element("tbody");
    for (const condition of report.conditionViolations) {
      tbody.append(
        renderClassificationRow({
          label: condition.label,
          detail: condition.id,
          count: condition.violationCount,
          rate: condition.violationRate,
          classificationCounts: condition.classificationCounts,
          classificationRates: condition.classificationRates,
        }),
      );
    }
    tbody.append(
      renderClassificationRow({
        className: "summary-row",
        label: `filter前 ${formatInteger(report.totalGenerated)}問`,
        detail: "通常生成した全問題",
        count: report.totalGenerated,
        rate: 1,
        classificationCounts: report.overallClassificationCounts,
        classificationRates: report.overallClassificationRates,
      }),
      renderClassificationRow({
        className: "summary-row summary-row-continuation",
        label: "全filter通過",
        detail: `選択した${report.conditionViolations.length}条件をすべて通過`,
        count: report.allFiltersPassed.count,
        rate: report.allFiltersPassed.rate,
        classificationCounts: report.allFiltersPassed.classificationCounts,
        classificationRates: report.allFiltersPassed.classificationRates,
      }),
    );
    table.append(thead, tbody);
    wrapper.append(table);
    return wrapper;
  }

  function renderClassificationRow(row) {
    const tr = element("tr", row.className);
    const conditionCell = element("th", "condition-cell");
    conditionCell.append(
      document.createTextNode(row.label),
      elementWithText("small", row.detail),
    );
    tr.append(
      conditionCell,
      numberCell(row.count, row.rate),
      ...CLASSIFICATION_COLUMNS.map(([key]) =>
        numberCell(
          row.classificationCounts?.[key] ?? 0,
          row.classificationRates?.[key] ?? 0,
        ),
      ),
    );
    return tr;
  }

  function renderCohortSection(report, cohortKey, cohort) {
    const section = element("section");
    section.append(
      heading(
        2,
        `${cohortKey} — ${cohort.cohortLabel ?? ""}`,
        "section-heading",
      ),
      renderCohortSummary(cohort),
    );
    if (cohort.reference && cohort.showReferenceCard !== false) {
      section.append(
        heading(3, "原本基準点（表示レベル2）"),
        renderReferenceCards(cohort.reference),
      );
    }

    const candidates = isRecord(cohort.reviewCandidates)
      ? cohort.reviewCandidates
      : {};
    for (const [key, label] of CANDIDATE_GROUPS) {
      section.append(heading(3, label, "candidate-heading"));
      const group = Array.isArray(candidates[key]) ? candidates[key] : [];
      if (group.length === 0) {
        section.append(elementWithText("p", "該当問題なし", "empty-group"));
        continue;
      }
      const grid = element("div", "candidate-grid review-candidate-grid");
      group.forEach((candidate) => {
        grid.append(renderCandidateCard(candidate, label));
      });
      section.append(grid);
    }
    return section;
  }

  function renderCohortSummary(cohort) {
    const counts = cohort.classificationCounts ?? {};
    const grid = element("div", "summary-grid");
    for (const [key, label] of [
      ["reference_like", "原本近傍"],
      ["clearly_easier", "明らかに簡単側"],
      ["clearly_harder", "明らかに難しい側"],
      ["mixed", "指標が混合"],
    ]) {
      const value = counts[key] ?? {};
      grid.append(
        summaryPanel(
          label,
          `${formatInteger(value.count ?? 0)}問`,
          formatPercent(value.ratio ?? 0),
        ),
      );
    }
    return grid;
  }

  function renderReferenceCards(reference) {
    const grid = element("div", "reference-card-grid");
    const source = reference.source ?? {};
    const sourceLabel = `p.${source.bookPage ?? "?"} / level${
      source.printedDifficulty ?? "?"
    }`;
    grid.append(
      renderStaticBoardCard(
        "原本例題",
        sourceLabel,
        reference.puzzle,
        undefined,
      ),
      renderStaticBoardCard(
        "原本解答",
        reference.sourceProblemId ?? "",
        reference.puzzle,
        reference.canonicalSolution,
      ),
    );
    return grid;
  }

  function renderStaticBoardCard(title, detail, puzzle, solution) {
    const article = element("article", "candidate-card");
    const content = element("div", "candidate-content");
    const head = element("div", "card-head");
    head.append(
      elementWithText("strong", title),
      elementWithText("code", detail),
    );
    content.append(head, renderBoard(puzzle, solution));
    article.append(content);
    return article;
  }

  function renderCandidateCard(candidate, groupLabel) {
    const article = element("article", "candidate-card");
    const button = element("button", "candidate-button");
    button.type = "button";
    button.setAttribute("aria-label", `${groupLabel}の問題を拡大`);
    button.append(renderBoard(candidate.puzzle));
    button.addEventListener("click", () => openCandidate(candidate, groupLabel));
    article.append(button);
    return article;
  }

  function openCandidate(candidate, groupLabel) {
    dialogContent.replaceChildren();
    const head = element("div", "dialog-head");
    const titleBlock = element("div");
    titleBlock.append(heading(2, groupLabel));
    const idRow = element("div", "dialog-id-row");
    const identifier = candidate.id ?? candidate.seed ?? candidate.puzzle?.puzzleId;
    idRow.append(elementWithText("code", identifier ?? "", "dialog-id"));
    const copyButton = element("button", "copy-id");
    copyButton.type = "button";
    copyButton.textContent = "IDをコピー";
    copyButton.addEventListener("click", async () => {
      await copyWithFeedback(copyButton, identifier ?? "", "コピー済み");
    });
    idRow.append(copyButton);
    titleBlock.append(idRow);

    const closeButton = element("button", "dialog-close");
    closeButton.type = "button";
    closeButton.textContent = "閉じる";
    closeButton.addEventListener("click", () => dialog.close());
    head.append(titleBlock, closeButton);

    const boards = element("div", "dialog-boards");
    boards.append(
      boardSection("問題", candidate.puzzle),
      boardSection("答え", candidate.puzzle, candidate.canonicalSolution),
    );
    dialogContent.append(head, boards, renderCandidateDetails(candidate));
    dialog.showModal();
  }

  function renderCandidateDetails(candidate) {
    const wrapper = element("div", "dialog-details");
    const classification = candidate.classification ?? "mixed_easier";
    const summary = element("p", "modal-summary");
    summary.append(
      badge(
        CLASSIFICATION_LABELS[classification] ??
          classification.replaceAll("_", " "),
        classification,
      ),
      badge(
        candidate.filterEvaluation?.allPassed ? "filter通過" : "filter違反あり",
        candidate.filterEvaluation?.allPassed ? "filter-pass" : "filter-fail",
      ),
    );
    const failedRules = candidate.filterEvaluation?.failedRules ?? [];
    if (failedRules.length > 0) {
      summary.append(
        document.createTextNode(
          ` 違反: ${failedRules.map((rule) => rule.label ?? rule.id).join(" / ")}`,
        ),
      );
    }
    wrapper.append(summary);

    const table = element("table", "modal-table");
    const tbody = element("tbody");
    for (let index = 0; index < METRICS.length; index += 2) {
      const tr = element("tr");
      for (const [key, label] of METRICS.slice(index, index + 2)) {
        tr.append(
          textCell("th", label),
          textCell("td", formatInteger(candidate.metrics?.[key] ?? 0)),
        );
      }
      tbody.append(tr);
    }
    table.append(tbody);
    wrapper.append(table);
    return wrapper;
  }

  function boardSection(title, puzzle, solution) {
    const section = element("section");
    section.append(heading(3, title), renderBoard(puzzle, solution));
    return section;
  }

  function renderBoard(puzzle, solution) {
    const width = puzzle?.width ?? 1;
    const height = puzzle?.height ?? 1;
    const size = 400;
    const padding = 8;
    const cellWidth = (size - padding * 2) / width;
    const cellHeight = (size - padding * 2) / height;
    const symbolScale = Math.min(cellWidth, cellHeight);
    const svg = svgElement("svg", {
      viewBox: `0 0 ${size} ${size}`,
      role: "img",
      "aria-label": `${width}×${height}、端点${
        puzzle?.terminals?.length ?? 0
      }個`,
    });

    const grid = svgElement("g", {
      stroke: "#9aaaa6",
      "stroke-width": "1.5",
    });
    for (let column = 0; column <= width; column += 1) {
      const x = padding + column * cellWidth;
      grid.append(
        svgElement("line", {
          x1: x,
          y1: padding,
          x2: x,
          y2: size - padding,
        }),
      );
    }
    for (let row = 0; row <= height; row += 1) {
      const y = padding + row * cellHeight;
      grid.append(
        svgElement("line", {
          x1: padding,
          y1: y,
          x2: size - padding,
          y2: y,
        }),
      );
    }
    svg.append(grid);

    for (const path of solution?.paths ?? []) {
      const points = path.cells
        .map((cell) => {
          const {x, y} = cellCenter(cell, padding, cellWidth, cellHeight);
          return `${x},${y}`;
        })
        .join(" ");
      svg.append(
        svgElement("polyline", {
          points,
          fill: "none",
          stroke: "#263b37",
          "stroke-width": Math.max(7, symbolScale * .14),
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        }),
      );
    }

    for (const terminal of puzzle?.terminals ?? []) {
      const center = cellCenter(terminal, padding, cellWidth, cellHeight);
      svg.append(renderTerminal(terminal.symbol, center, symbolScale));
    }
    return svg;
  }

  function renderTerminal(symbol, center, scale) {
    const strokeWidth = Math.max(5, scale * .095);
    const common = {
      fill: "#fff",
      stroke: "#c65d36",
      "stroke-width": strokeWidth,
    };
    if (symbol === "circle") {
      return svgElement("circle", {
        ...common,
        cx: center.x,
        cy: center.y,
        r: scale * .28,
      });
    }
    if (symbol === "triangle") {
      const top = center.y - scale * .33;
      const bottom = center.y + scale * .29;
      const halfWidth = scale * .33;
      return svgElement("polygon", {
        ...common,
        points: `${center.x},${top} ${center.x - halfWidth},${bottom} ${
          center.x + halfWidth
        },${bottom}`,
        "stroke-linejoin": "round",
      });
    }
    const side = scale * .56;
    return svgElement("rect", {
      ...common,
      x: center.x - side / 2,
      y: center.y - side / 2,
      width: side,
      height: side,
      rx: 2,
    });
  }

  function cellCenter(cell, padding, cellWidth, cellHeight) {
    return {
      x: padding + (cell.column + .5) * cellWidth,
      y: padding + (cell.row + .5) * cellHeight,
    };
  }

  function summaryPanel(label, value, detail) {
    const panel = element("div", "panel");
    panel.append(
      elementWithText("span", label),
      elementWithText("strong", value),
      elementWithText("span", detail),
    );
    return panel;
  }

  function numberCell(count, rate) {
    const td = element("td", "number-cell");
    td.append(
      elementWithText("strong", `${formatInteger(count)}問`),
      elementWithText("small", formatPercent(rate)),
    );
    return td;
  }

  function badge(label, className) {
    return elementWithText("span", label, `badge ${className}`);
  }

  function heading(level, text, className) {
    return elementWithText(`h${level}`, text, className);
  }

  function textCell(tagName, text) {
    return elementWithText(tagName, String(text));
  }

  function elementWithText(tagName, text, className) {
    const node = element(tagName, className);
    node.textContent = text;
    return node;
  }

  function element(tagName, className) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    return node;
  }

  function svgElement(tagName, attributes) {
    const node = document.createElementNS(SVG_NS, tagName);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, String(value));
    }
    return node;
  }

  function formatInteger(value) {
    return new Intl.NumberFormat("ja-JP", {maximumFractionDigits: 0}).format(
      Number(value),
    );
  }

  function formatDecimal(value) {
    return new Intl.NumberFormat("ja-JP", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    }).format(Number(value));
  }

  function formatPercent(rate) {
    return new Intl.NumberFormat("ja-JP", {
      style: "percent",
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(Number(rate));
  }

  async function copyWithFeedback(button, text, successLabel) {
    const original = button.textContent;
    await copyText(text);
    button.textContent = successLabel;
    window.setTimeout(() => {
      button.textContent = original;
    }, 1200);
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function setStatus(message, isError = false) {
    loadStatus.textContent = message;
    loadStatus.classList.toggle("is-error", isError);
  }

  function showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(
      `読み込めませんでした: ${message} 監査JSONの配置とローカルサーバーを確認してください。`,
      true,
    );
    loadPanel.hidden = false;
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isSafeReportFileName(value) {
    return (
      typeof value === "string" &&
      value.length > 5 &&
      value === value.trim() &&
      value.toLowerCase().endsWith(".json") &&
      !value.includes("/") &&
      !value.includes("\\") &&
      !value.includes("..") &&
      !value.includes("\0")
    );
  }

  function requireString(record, key) {
    if (typeof record[key] !== "string") {
      throw new Error(`${key}が文字列ではありません。`);
    }
  }

  function requireFiniteNumber(record, key) {
    if (!Number.isFinite(record[key])) {
      throw new Error(`${key}が有限数ではありません。`);
    }
  }
})();
