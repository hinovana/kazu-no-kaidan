/**
 * 6×6難易度監査の集計とレビュー標本を、自己完結したHTMLへ描画する。
 *
 * 問題を先に見てから答えを開ける構成とする。reportの指定に応じて、
 * 人間レビュー入力をbrowserのlocalStorageへ保存するformも追加できる。
 */

/**
 * 難易度監査reportを、外部asset不要の人間レビュー用HTMLへ変換する。
 *
 * review入力は生成HTMLのlocalStorageに保存し、JSONとして書き出せる。
 * report自体や入力内容をリポジトリへ保存する処理は行わない。
 */
export function renderDifficultyAuditHtml(report) {
  const reviewEnabled = report.reviewEnabled !== false;
  const compactCandidateCards = report.compactCandidateCards === true;
  const showToolbar = report.showToolbar !== false;
  const designTheme = [
    "editorial",
    "dashboard",
    "dashboard-solid",
    "dashboard-glow",
    "dashboard-frame",
    "night",
  ].includes(report.designTheme)
    ? report.designTheme
    : "default";
  const bodyClasses = [
    `theme-${designTheme}`,
    designTheme.startsWith("dashboard") ? "theme-dashboard-family" : "",
  ].filter(Boolean).join(" ");
  const reviewControlsEnabled =
    reviewEnabled && !compactCandidateCards && showToolbar;
  const conditionCopyEnabled =
    report.showConditionCopyButton === true
    && report.filterAudit !== undefined;
  const sections = Object.entries(report.byProfile)
    .map(([profileId, summary], profileIndex) =>
      renderProfileSection(profileId, summary, {
        compactCandidateCards,
        pairedCandidateCards: report.pairedCandidateCards === true,
        profileIndex,
        reviewEnabled: reviewControlsEnabled,
        showCandidateCardMetrics: report.showCandidateCardMetrics !== false,
        showGeneratedDistribution: report.showGeneratedDistribution !== false,
        showReferencePercentiles: report.showReferencePercentiles !== false,
      })
    )
    .join("\n");
  const reportTitle =
    report.reportTitle ?? "おなじのつなぎ 6×6 難易度監査";
  const toolbarSummary =
    report.toolbarSummary ?? `生成 ${formatNumber(report.totalGenerated)}問`;
  const lead = report.lead
    ?? `原本の6×6問題3問をprofileごとの基準点とし、各profile ${
      formatNumber(report.samplesPerProfile)
    }問を比較しました。`;
  const storageKey = report.reviewStorageKey
    ?? "onaji-no-tsunagi-v34-difficulty-review";
  const exportFileName = report.reviewExportFileName
    ?? "onaji-no-tsunagi-v34-human-review.json";
  const mainClasses = [
    report.fullWidthLayout === true ? "full-width" : "",
    report.compactCandidateCards === true ? "compact-candidates" : "",
    report.pairedCandidateCards === true ? "paired-candidates" : "",
  ].filter(Boolean).join(" ");
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1f302d;
      background: #f4f2eb;
    }
    body { margin: 0; }
    main { max-width: 1240px; margin: 0 auto; padding: 28px 20px 80px; }
    main.full-width { max-width: none; margin: 0; padding: 16px 8px 80px; }
    h1, h2, h3 { line-height: 1.25; }
    h1 { margin-bottom: 8px; }
    .lead, .note {
      max-width: 72rem;
      line-height: 1.75;
    }
    .warning {
      border-left: 5px solid #c65d36;
      background: #fff8f3;
      padding: 14px 18px;
      margin: 18px 0;
    }
    .finding {
      border-left-color: #1f6f64;
      background: #f2faf7;
    }
    .summary-grid, .candidate-grid {
      display: grid;
      gap: 16px;
    }
    .summary-grid {
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      margin: 16px 0 24px;
    }
    .candidate-grid {
      grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
    }
    .panel, .review-card {
      background: #fff;
      border: 1px solid #c8d0cd;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
    }
    .panel strong { display: block; font-size: 1.4rem; }
    table { border-collapse: collapse; width: 100%; background: #fff; }
    .table-wrap { overflow-x: auto; }
    th, td {
      border: 1px solid #d5dcda;
      padding: 8px 10px;
      text-align: right;
    }
    th:first-child, td:first-child { text-align: left; }
    .condition-cell { min-width: 20rem; line-height: 1.45; }
    .condition-cell small { display: block; margin-top: 4px; color: #52615e; }
    .number-cell { white-space: nowrap; }
    .number-cell strong { display: block; font-size: 1.05rem; }
    .number-cell small { display: block; color: #52615e; }
    .summary-row th, .summary-row td {
      border-top: 3px solid #7e918b;
      background: #f2faf7;
    }
    .summary-row-continuation th, .summary-row-continuation td {
      border-top-width: 1px;
    }
    .table-note { color: #52615e; font-size: .86rem; line-height: 1.65; }
    .heading-with-action {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1em;
    }
    .heading-with-action h3 { margin-right: auto; }
    .copy-conditions {
      flex: 0 0 auto;
      padding: 6px 10px;
      border: 1px solid #8fa29d;
      border-radius: 7px;
      background: #fff;
      color: #1f302d;
      font-size: .78rem;
    }
    .board-wrap { display: flex; justify-content: center; margin: 12px 0; }
    svg { width: min(100%, 390px); height: auto; background: #fff; }
    details { margin: 12px 0; }
    summary { cursor: pointer; font-weight: 700; color: #8d3d24; }
    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 4px 9px;
      margin-right: 5px;
      font-size: .82rem;
      background: #edf1ef;
    }
    .clearly_easier { background: #e5f3e9; }
    .reference_like { background: #e5edf7; }
    .clearly_harder { background: #f9e5df; }
    .mixed { background: #f2ead7; }
    .filter-pass { background: #e5f3e9; }
    .filter-fail { background: #f9e5df; }
    .metrics { font-size: .9rem; line-height: 1.55; }
    .seed { overflow-wrap: anywhere; font-family: ui-monospace, monospace; }
    label { display: block; margin-top: 10px; font-weight: 650; }
    select, textarea {
      box-sizing: border-box;
      width: 100%;
      margin-top: 4px;
      padding: 8px;
      font: inherit;
    }
    textarea { min-height: 70px; resize: vertical; }
    button {
      border: 0;
      border-radius: 8px;
      padding: 10px 14px;
      background: #1f6f64;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      background: rgb(244 242 235 / 95%);
      padding: 10px 0;
    }
    .section-heading { margin-top: 42px; border-bottom: 2px solid #b6c0bd; }
    .candidate-heading { margin-top: 28px; }
    .compact-candidates .review-candidate-grid {
      grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
      gap: 7px;
    }
    .paired-candidates .review-candidate-grid {
      grid-template-columns: repeat(auto-fill, minmax(365px, 1fr));
    }
    .compact-candidates .candidate-card {
      min-width: 0;
      overflow: hidden;
      border: 1px solid #c3cdca;
      border-radius: 8px;
      background: #fff;
    }
    .compact-candidates .candidate-button,
    .compact-candidates .candidate-content {
      display: block;
      box-sizing: border-box;
      width: 100%;
      padding: 6px;
      border: 0;
      border-radius: 0;
      background: none;
      color: inherit;
      text-align: left;
    }
    .compact-candidates .candidate-button { cursor: zoom-in; }
    .compact-candidates .candidate-button:hover { background: #fff8e9; }
    .compact-candidates .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 5px;
      min-width: 0;
      font-size: 10px;
    }
    .compact-candidates .card-head strong {
      font-size: 14px;
      color: #b84f2c;
    }
    .compact-candidates .card-head code {
      min-width: 0;
      overflow: hidden;
      color: #60706b;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .compact-candidates .candidate-card svg {
      display: block;
      width: 100%;
      max-width: none;
      aspect-ratio: 1;
      margin: 3px 0;
    }
    .compact-candidates .metric-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 3px;
      color: #52635e;
      font-size: 9px;
      text-align: center;
    }
    .compact-candidates .paired-mini-boards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin: 3px 0;
    }
    .compact-candidates .paired-mini-boards span {
      display: block;
      color: #52635e;
      font-size: 9px;
      font-weight: 700;
      text-align: center;
    }
    .compact-candidates .paired-mini-boards svg { margin: 1px 0 0; }
    .compact-candidates .reference-card-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 178px));
      gap: 7px;
    }
    dialog {
      width: min(920px, 94vw);
      max-height: 94vh;
      padding: 18px;
      border: 0;
      border-radius: 14px;
      box-shadow: 0 20px 70px #0006;
    }
    dialog::backdrop { background: #172420b3; }
    .dialog-head {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
    }
    .dialog-head h2 { margin: 0 0 4px; }
    .dialog-head code { overflow-wrap: anywhere; font-size: 12px; }
    .dialog-id-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .copy-id {
      flex: 0 0 auto;
      padding: 4px 8px;
      border: 1px solid #9baaa5;
      border-radius: 6px;
      background: #fff;
      color: #1f302d;
      font-size: 11px;
      cursor: pointer;
    }
    .dialog-close {
      padding: 8px 14px;
      border: 1px solid #9baaa5;
      border-radius: 8px;
      background: #fff;
      color: #1f302d;
      cursor: pointer;
    }
    .dialog-boards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 22px;
      margin-top: 12px;
    }
    .dialog-boards h3 { margin: 0; text-align: center; }
    .dialog-boards svg { width: 100%; max-height: 52vh; }
    .dialog-details { margin-top: 12px; }
    .dialog-details .metrics { font-size: .82rem; }
    .dialog-details .table-note { font-size: .8rem; }
    .dialog-details table { font-size: .82rem; }
    .dialog-details th, .dialog-details td { padding: 6px 8px; }
    .theme-editorial {
      color: #332b25;
      background:
        radial-gradient(circle at top right, #f5d7bb 0, transparent 32rem),
        #eee7dc;
    }
    .theme-editorial main { max-width: none; }
    .theme-editorial h1,
    .theme-editorial h2,
    .theme-editorial h3 {
      font-family: "Iowan Old Style", "Yu Mincho", "Hiragino Mincho ProN",
        serif;
      letter-spacing: .015em;
    }
    .theme-editorial h1 {
      margin-top: 4px;
      color: #71331f;
      font-size: clamp(1.75rem, 3vw, 2.8rem);
    }
    .theme-editorial .section-heading {
      padding: 10px 13px;
      border: 0;
      border-left: 6px solid #bd5d35;
      border-radius: 0 10px 10px 0;
      background: linear-gradient(90deg, #fff8ef, #fff8ef00);
    }
    .theme-editorial .panel,
    .theme-editorial .candidate-card {
      border-color: #d3c2b0;
      box-shadow: 0 7px 18px #6b49301a;
    }
    .theme-editorial .panel { border-radius: 14px; }
    .theme-editorial table {
      color: #332b25;
      background: #fffdf9;
    }
    .theme-editorial th,
    .theme-editorial td { border-color: #ddd0c2; }
    .theme-editorial thead th {
      color: #6c3b27;
      background: #f4e8dc;
    }
    .theme-editorial .summary-row th,
    .theme-editorial .summary-row td { background: #f7eee3; }
    .theme-editorial .candidate-button:hover { background: #fff5e8; }
    .theme-editorial .card-head strong,
    .theme-editorial .number-cell strong { color: #a54e2d; }
    .theme-editorial dialog { background: #fffdf9; color: #332b25; }

    .theme-dashboard {
      background:
        linear-gradient(90deg, #d6e1e8 1px, transparent 1px),
        linear-gradient(#d6e1e8 1px, transparent 1px),
        #eaf0f4;
      background-size: 24px 24px;
    }
    .theme-dashboard-solid {
      background: #e5edf2;
    }
    .theme-dashboard-glow {
      background:
        radial-gradient(circle at 12% 0, #cfe6ec 0, transparent 34rem),
        radial-gradient(circle at 92% 22%, #dbe6f4 0, transparent 30rem),
        #edf3f6;
    }
    .theme-dashboard-frame {
      background: #cbd8df;
    }
    .theme-dashboard-solid main.full-width,
    .theme-dashboard-glow main.full-width,
    .theme-dashboard-frame main.full-width {
      padding-inline: 1em;
    }
    .theme-dashboard-frame main.full-width {
      max-width: 1680px;
      margin-inline: auto;
      border-inline: 1px solid #b3c4cd;
      background: #f1f6f8;
      box-shadow: 0 0 32px #324c5c24;
    }
    .theme-dashboard-family {
      color: #152532;
    }
    .theme-dashboard-family main { max-width: none; }
    .theme-dashboard-family h1 {
      margin: 0 0 16px;
      color: #102f49;
      font-size: clamp(1.6rem, 2.6vw, 2.35rem);
      letter-spacing: -.025em;
    }
    .theme-dashboard-family .section-heading {
      padding: 9px 12px;
      border: 0;
      border-radius: 4px;
      background: #153852;
      color: #fff;
      letter-spacing: .02em;
    }
    .theme-dashboard-family .summary-grid { gap: 8px; }
    .theme-dashboard-family .panel,
    .theme-dashboard-family .candidate-card {
      border-color: #aebfc9;
      border-radius: 5px;
      box-shadow: none;
    }
    .theme-dashboard-family .panel {
      border-top: 4px solid #168a9b;
      background: #f9fcfd;
    }
    .theme-dashboard-family table {
      color: #152532;
      background: #f9fcfd;
    }
    .theme-dashboard-family th,
    .theme-dashboard-family td { border-color: #c3d0d7; }
    .theme-dashboard-family thead th {
      background: #dce9ef;
      color: #17354b;
      font-size: .8rem;
      letter-spacing: .02em;
    }
    .theme-dashboard-family .condition-cell small,
    .theme-dashboard-family .number-cell small { color: #587181; }
    .theme-dashboard-family .summary-row th,
    .theme-dashboard-family .summary-row td { background: #dff2f1; }
    .theme-dashboard-family .candidate-button:hover {
      background: #e8f5f7;
    }
    .theme-dashboard-family .card-head strong,
    .theme-dashboard-family .number-cell strong { color: #087789; }
    .theme-dashboard-family .copy-conditions {
      border-color: #168a9b;
      color: #075d69;
    }
    .theme-dashboard-family dialog { background: #f7fbfc; color: #152532; }

    .theme-night {
      color: #e8efec;
      background:
        radial-gradient(circle at 15% 0, #314d46 0, transparent 30rem),
        #101817;
    }
    .theme-night h1 { color: #ffc574; }
    .theme-night .section-heading {
      padding-bottom: 8px;
      border-bottom-color: #d48b41;
      color: #f5cf99;
    }
    .theme-night .panel,
    .theme-night .candidate-card {
      border-color: #425550;
      background: #1b2826;
      box-shadow: 0 7px 20px #0006;
    }
    .theme-night .panel strong,
    .theme-night .card-head strong,
    .theme-night .number-cell strong { color: #ffbd68; }
    .theme-night table {
      color: #e8efec;
      background: #1b2826;
    }
    .theme-night th,
    .theme-night td { border-color: #40514d; }
    .theme-night thead th {
      color: #b9d3cc;
      background: #243632;
    }
    .theme-night .summary-row th,
    .theme-night .summary-row td { background: #244239; }
    .theme-night .condition-cell small,
    .theme-night .number-cell small,
    .theme-night .card-head code { color: #9db1ab; }
    .theme-night .candidate-button { color: #e8efec; }
    .theme-night .candidate-button:hover { background: #293b37; }
    .theme-night .candidate-card svg,
    .theme-night .dialog-boards svg { background: #fffdf7; }
    .theme-night dialog { background: #172320; color: #e8efec; }
    .theme-night .dialog-close,
    .theme-night .copy-id,
    .theme-night .copy-conditions {
      border-color: #60736e;
      background: #263733;
      color: #e8efec;
    }
    .theme-night .badge { color: #1f302d; }
    @media (max-width: 680px) {
      .dialog-boards { grid-template-columns: 1fr; }
    }
    @media (max-width: 620px) {
      main:not(.full-width) { padding-inline: 12px; }
      .candidate-grid:not(.review-candidate-grid) {
        grid-template-columns: 1fr;
      }
      .review-candidate-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .compact-candidates .reference-card-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      th, td { padding: 6px; font-size: .85rem; }
    }
  </style>
</head>
<body class="${escapeHtml(bodyClasses)}">
<main class="${escapeHtml(mainClasses)}">
  ${showToolbar
    ? `<div class="toolbar">
      <span>${escapeHtml(toolbarSummary)}</span>
      ${reviewControlsEnabled
        ? `<button id="export-review" type="button">レビュー結果をJSON保存</button>`
        : ""}
    </div>`
    : ""}
  <h1>${escapeHtml(reportTitle)}</h1>
  ${report.showLead === false
    ? ""
    : `<p class="lead">${escapeHtml(lead)}</p>`}
  ${report.showClassificationDisclaimer === false
    ? ""
    : `<div class="warning">
      <strong>これは体感難易度の自動判定ではありません。</strong>
      ${escapeHtml(report.classificationPolicy.disclaimer)}
      「原本近傍」は4指標中3つ以上が許容帯内、
      「明らかに簡単側／難しい側」は2つ以上が同じ方向を示し、
      反対方向の指標がない問題だけです。
    </div>`}
  ${report.showReportMeta === false
    ? ""
    : `<p class="note">レポート版: ${escapeHtml(report.schemaVersion)} /
      原本SHA-256: <span class="seed">${
        escapeHtml(report.referenceCorpus.sourceDocumentSha256 ?? "未登録")
      }</span></p>`}
  ${report.filterAudit === undefined
    ? ""
    : renderFilterAuditSummary(report)}
  ${report.experiment === undefined
    ? ""
    : renderExperimentSummary(report)}
  ${sections}
</main>
${compactCandidateCards || conditionCopyEnabled
  ? `<script>
  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = value;
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.append(fallback);
      fallback.select();
      document.execCommand("copy");
      fallback.remove();
    }
  }
</script>`
  : ""}
${conditionCopyEnabled
  ? `<script>
  for (const button of document.querySelectorAll(".copy-conditions")) {
    button.addEventListener("click", async () => {
      const lines = JSON.parse(button.dataset.copyLines);
      await copyText(lines.map(line => \`* \${line}\`).join("\\n"));
      button.textContent = "コピー済み";
    });
  }
</script>`
  : ""}
${compactCandidateCards
  ? `<dialog id="candidate-dialog"></dialog>
<script>
  const candidateDialog = document.querySelector("#candidate-dialog");
  for (const button of document.querySelectorAll(".candidate-button")) {
    button.addEventListener("click", () => {
      const template = document.getElementById(button.dataset.template);
      candidateDialog.replaceChildren(template.content.cloneNode(true));
      candidateDialog.querySelector(".dialog-close").addEventListener(
        "click",
        () => candidateDialog.close(),
      );
      const copyButton = candidateDialog.querySelector(".copy-id");
      copyButton.addEventListener("click", async () => {
        const id = candidateDialog.querySelector(".dialog-id").textContent;
        await copyText(id);
        copyButton.textContent = "コピー済み";
      });
      candidateDialog.showModal();
    });
  }
  candidateDialog.addEventListener("click", event => {
    if (event.target === candidateDialog) {
      candidateDialog.close();
    }
  });
</script>`
  : ""}
${reviewControlsEnabled
  ? `<script>
  const storageKey = ${serializeForScript(storageKey)};
  const controls = document.querySelectorAll("[data-review-id]");
  const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
  for (const control of controls) {
    const id = control.dataset.reviewId;
    const entry = saved[id] || {};
    for (const field of control.querySelectorAll("[data-review-field]")) {
      field.value = entry[field.dataset.reviewField] || "";
      field.addEventListener("input", save);
      field.addEventListener("change", save);
    }
  }
  function save() {
    const value = {};
    for (const control of controls) {
      const entry = {};
      for (const field of control.querySelectorAll("[data-review-field]")) {
        entry[field.dataset.reviewField] = field.value;
      }
      value[control.dataset.reviewId] = entry;
    }
    localStorage.setItem(storageKey, JSON.stringify(value));
  }
  document.querySelector("#export-review").addEventListener("click", () => {
    save();
    const payload = {
      schemaVersion: "onaji-no-tsunagi.human-difficulty-review.v1",
      exportedAt: new Date().toISOString(),
      reviews: JSON.parse(localStorage.getItem(storageKey) || "{}"),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2) + "\\n"], {
      type: "application/json",
    });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = ${serializeForScript(exportFileName)};
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  });
</script>`
  : ""}
</body>
</html>`;
}

function renderProfileSection(profileId, summary, options) {
  const reference = summary.reference;
  const counts = summary.classificationCounts;
  const showReferenceCards = summary.showReferenceCard !== false;
  const showReferenceSection =
    showReferenceCards || options.showReferencePercentiles;
  const candidateGroups = [
    ["明らかに簡単側", "clearlyEasier"],
    ["原本近傍", "referenceLike"],
    ["明らかに難しい側", "clearlyHarder"],
    ["混合指標・簡単側の端", "mixedEasyEdge"],
    ["混合指標・難しい側の端", "mixedHardEdge"],
    ["分布全体からの補完標本", "representativeFill"],
  ];
  return `<section>
    <h2 class="section-heading">${escapeHtml(profileId)}${
      summary.cohortLabel === undefined
        ? ""
        : ` — ${escapeHtml(summary.cohortLabel)}`
    }</h2>
    <div class="summary-grid">
      ${renderCountPanel("原本近傍", counts.reference_like)}
      ${renderCountPanel("明らかに簡単側", counts.clearly_easier)}
      ${renderCountPanel("明らかに難しい側", counts.clearly_harder)}
      ${renderCountPanel("指標が混合", counts.mixed)}
    </div>
    ${showReferenceSection
      ? `<h3>原本基準点（表示レベル${
        escapeHtml(String(reference.source.printedDifficulty))
      }）</h3>
      <div class="${options.compactCandidateCards
        ? "reference-card-grid"
        : "candidate-grid"}">
        ${showReferenceCards
          ? renderReferenceCard(reference, options.compactCandidateCards)
          : ""}
        ${options.showReferencePercentiles
          ? `<div class="panel">
            <h3>原本の生成分布内percentile</h3>
            ${renderPercentileTable(summary.referencePercentiles)}
            <p class="note">値以下の生成問題が何割あるかを示します。
            強制出口は多いほど簡単側とみなすため、percentileの向きだけで
            難易度を判断しません。</p>
          </div>`
          : ""}
      </div>`
      : ""}
    ${options.showGeneratedDistribution
      ? `<h3>生成分布</h3>
        ${renderDistributionTable(
          summary.generatedDistributions,
          reference.metrics,
        )}`
      : ""}
    ${candidateGroups.map(([label, key], groupIndex) => {
      const candidates = summary.reviewCandidates[key];
      if (candidates.length === 0) {
        return `<h3 class="candidate-heading">${label}</h3>
          <p>該当するレビュー候補はありません。</p>`;
      }
      return `<h3 class="candidate-heading">${label}</h3>
        <div class="candidate-grid review-candidate-grid">
          ${candidates.map((candidate, candidateIndex) => renderCandidateCard(
            candidate,
            reference,
            {
              compactCandidateCards: options.compactCandidateCards,
              dialogId:
                `candidate-${options.profileIndex}-${groupIndex}-${candidateIndex}`,
              label,
              number: candidateIndex + 1,
              pairedCandidateCards: options.pairedCandidateCards,
              reviewEnabled: options.reviewEnabled,
              showCandidateCardMetrics: options.showCandidateCardMetrics,
            },
          )).join("\n")}
        </div>`;
    }).join("\n")}
  </section>`;
}

function renderCountPanel(label, summary) {
  return `<div class="panel"><span>${escapeHtml(label)}</span>
    <strong>${formatNumber(summary.count)}問</strong>
    <span>${formatPercent(summary.ratio)}</span></div>`;
}

function renderReferenceCard(reference, compactCandidateCards) {
  if (compactCandidateCards) {
    const sourceLabel =
      `p.${reference.source.bookPage} / level${reference.source.printedDifficulty}`;
    return `<article class="candidate-card">
      <div class="candidate-content">
        <div class="card-head"><strong>原本例題</strong>
          <code>${escapeHtml(sourceLabel)}</code></div>
        ${renderBoard(reference.puzzle)}
      </div>
    </article>
    <article class="candidate-card">
      <div class="candidate-content">
        <div class="card-head"><strong>原本解答</strong>
          <code>${escapeHtml(reference.sourceProblemId)}</code></div>
        ${renderBoard(reference.puzzle, reference.canonicalSolution)}
      </div>
    </article>`;
  }
  return `<article class="review-card">
    <span class="badge reference_like">原本</span>
    <h3>${escapeHtml(reference.sourceProblemId)}</h3>
    <p>書籍p.${escapeHtml(String(reference.source.bookPage))} /
    表示レベル${escapeHtml(String(reference.source.printedDifficulty))}</p>
    <div class="board-wrap">${renderBoard(reference.puzzle)}</div>
    <details>
      <summary>原本問題を現行solverで解いた答えを表示</summary>
      <div class="board-wrap">${
        renderBoard(reference.puzzle, reference.canonicalSolution)
      }</div>
    </details>
    ${renderMetrics(reference.metrics, null)}
  </article>`;
}

function renderCandidateCard(candidate, reference, options) {
  const labels = {
    reference_like: "原本近傍",
    clearly_easier: "明らかに簡単側",
    clearly_harder: "明らかに難しい側",
    mixed: candidate.directionScore < 0
      ? "指標混合: 簡単寄り"
      : "指標混合: 難しい寄り",
  };
  if (options.compactCandidateCards) {
    const filterDetails = candidate.filterEvaluation === undefined
      || candidate.filterEvaluation.failedRules.length === 0
      ? ""
      : `<p class="table-note"><strong>違反:</strong> ${
        candidate.filterEvaluation.failedRules
          .map(rule => escapeHtml(rule.label))
          .join(" / ")
      }</p>`;
    return `<article class="candidate-card">
      <button type="button" class="candidate-button"
        data-template="${escapeHtml(options.dialogId)}"
        aria-label="${escapeHtml(options.label)}の候補${
          options.number
        }を拡大">
        ${options.pairedCandidateCards
          ? `<div class="paired-mini-boards">
            <div><span>問題</span>${renderBoard(candidate.puzzle)}</div>
            <div><span>答え</span>${
              renderBoard(candidate.puzzle, candidate.canonicalSolution)
            }</div>
          </div>`
          : renderBoard(candidate.puzzle)}
        ${options.showCandidateCardMetrics
          ? `<div class="metric-row">
            <span>使用 ${formatNumber(candidate.metrics.usedCellCount)}</span>
            <span>曲がり ${formatNumber(candidate.metrics.totalTurnCount)}</span>
            <span>状態 ${formatNumber(candidate.metrics.solverStateCount)}</span>
          </div>`
          : ""}
      </button>
      <template id="${escapeHtml(options.dialogId)}">
        <div class="dialog-head">
          <div><h2>${escapeHtml(options.label)} #${options.number}</h2>
            <div class="dialog-id-row">
              <code class="dialog-id">${escapeHtml(candidate.seed)}</code>
              <button type="button" class="copy-id">IDをコピー</button>
            </div>
          </div>
          <button type="button" class="dialog-close">閉じる</button>
        </div>
        <div class="dialog-boards">
          <section><h3>問題</h3>${renderBoard(candidate.puzzle)}</section>
          <section><h3>答え</h3>${
            renderBoard(candidate.puzzle, candidate.canonicalSolution)
          }</section>
        </div>
        <div class="dialog-details">
          <p>
            <span class="badge ${escapeHtml(candidate.classification)}">${
              escapeHtml(labels[candidate.classification])
            }</span>
            <span class="badge">score ${candidate.directionScore}</span>
            ${candidate.filterEvaluation === undefined
              ? ""
              : candidate.filterEvaluation.allPassed
              ? `<span class="badge filter-pass">全filter通過</span>`
              : `<span class="badge filter-fail">filter却下</span>`}
          </p>
          ${filterDetails}
          ${renderMetrics(candidate.metrics, reference.metrics)}
          ${candidate.placement === undefined
            ? ""
            : renderPlacement(candidate.placement)}
          <p class="metrics">指標方向: ${
            Object.entries(candidate.indicatorDirections)
              .map(([key, value]) =>
                `${escapeHtml(key)}=${escapeHtml(value)}`
              )
              .join(" / ")
          }</p>
        </div>
      </template>
    </article>`;
  }
  return `<article class="review-card" data-review-id="${
    escapeHtml(candidate.id)
  }">
    <span class="badge ${escapeHtml(candidate.classification)}">${
      escapeHtml(labels[candidate.classification])
    }</span>
    <span class="badge">score ${candidate.directionScore}</span>
    ${candidate.filterEvaluation === undefined
      ? ""
      : candidate.filterEvaluation.allPassed
      ? `<span class="badge filter-pass">全filter通過</span>`
      : `<span class="badge filter-fail">filter却下</span>`}
    <h3 class="seed">${escapeHtml(candidate.seed)}</h3>
    ${candidate.filterEvaluation === undefined
      || candidate.filterEvaluation.failedRules.length === 0
      ? ""
      : `<p class="table-note"><strong>違反:</strong> ${
        candidate.filterEvaluation.failedRules
          .map(rule => escapeHtml(rule.label))
          .join(" / ")
      }</p>`}
    <div class="board-wrap">${renderBoard(candidate.puzzle)}</div>
    <details>
      <summary>答えと指標を表示</summary>
      <div class="board-wrap">${
        renderBoard(candidate.puzzle, candidate.canonicalSolution)
      }</div>
      ${renderMetrics(candidate.metrics, reference.metrics)}
      ${candidate.placement === undefined
        ? ""
        : renderPlacement(candidate.placement)}
      <p class="metrics">指標方向: ${
        Object.entries(candidate.indicatorDirections)
          .map(([key, value]) => `${escapeHtml(key)}=${escapeHtml(value)}`)
          .join(" / ")
      }</p>
    </details>
    ${options.reviewEnabled
      ? `<label>人間の判断
      <select data-review-field="judgment">
        <option value="">未レビュー</option>
        <option value="reference_equivalent">原本と同等</option>
        <option value="acceptable_easier">簡単側だが許容</option>
        <option value="too_easy">明らかに簡単すぎる</option>
        <option value="acceptable_harder">難しい側だが許容</option>
        <option value="too_hard">明らかに難しすぎる</option>
        <option value="unsure">判断保留</option>
      </select>
    </label>
    <label>メモ
      <textarea data-review-field="notes"
        placeholder="取っ掛かり、誤仮説、蛇行、解後の納得など"></textarea>
    </label>`
      : ""}
  </article>`;
}

function renderFilterAuditSummary(report) {
  const groups = report.filterAudit.classificationGroups;
  const passed = report.allFiltersPassed;
  const rejected = report.rejectedByAnyFilter;
  const overallRates = report.overallClassificationRates;
  const classificationRows = groups.map(group => `<tr>
    <th>${escapeHtml(group.label)}</th>
    ${renderRateCell(
      report.overallClassificationCounts[group.id],
      overallRates[group.id],
    )}
    ${renderRateCell(
      passed.classificationCounts[group.id],
      passed.classificationRates[group.id],
    )}
    ${renderRateCell(
      rejected.classificationCounts[group.id],
      rejected.classificationRates[group.id],
    )}
  </tr>`).join("");
  const conditionRows = report.conditionViolations.map(condition => `<tr>
    <th class="condition-cell">${escapeHtml(condition.label)}
      <small>${escapeHtml(condition.id)}</small></th>
    ${renderRateCell(condition.violationCount, condition.violationRate)}
    ${groups.map(group => renderRateCell(
      condition.classificationCounts[group.id],
      condition.classificationRates[group.id],
    )).join("")}
  </tr>`).join("");
  const allFiltersPassedRow = `<tr class="summary-row${
    report.combineClassificationSummaryIntoConditionTable === true
      ? " summary-row-continuation"
      : ""
  }">
    <th class="condition-cell">全filter通過
      <small>選択した6条件をすべて通過</small></th>
    ${renderRateCell(passed.count, passed.rate)}
    ${groups.map(group => renderRateCell(
      passed.classificationCounts[group.id],
      passed.classificationRates[group.id],
    )).join("")}
  </tr>`;
  const filterBeforeRow = `<tr class="summary-row">
    <th class="condition-cell">filter前 ${formatNumber(report.sampleCount)}問
      <small>通常生成した全問題</small></th>
    ${renderRateCell(report.sampleCount, 1)}
    ${groups.map(group => renderRateCell(
      report.overallClassificationCounts[group.id],
      overallRates[group.id],
    )).join("")}
  </tr>`;
  const easyBefore = overallRates.clearly_easier;
  const easyAfter = passed.classificationRates.clearly_easier;
  const conditionCopyLines = escapeHtml(JSON.stringify(
    report.conditionViolations.map(condition => condition.label),
  ));
  return `<section>
    <h2 class="section-heading">${
      report.showFilterConclusion === false ? "集計" : "結論と集計"
    }</h2>
    ${report.showFilterConclusion === false
      ? ""
      : `<div class="warning finding">
        <strong>結論: 現在の6条件は、この${formatNumber(
          report.sampleCount,
        )}問を原本近傍へ寄せていません。</strong>
        filter前の原本近傍は ${
          formatNumber(report.overallClassificationCounts.reference_like)
        }問（${formatPercent(overallRates.reference_like)}）、
        全条件通過後は
        ${formatNumber(passed.classificationCounts.reference_like)}問（${
          formatPercent(passed.classificationRates.reference_like)
        }）です。明らかに簡単側も ${formatPercent(easyBefore)} から
        ${formatPercent(easyAfter)} で、改善していません。一方で
        ${formatNumber(rejected.count)}問を除外しています。したがって、
        この6条件だけを調整して「原本近傍率を高める」段階ではなく、
        まず生成profileと原本基準指標の構造差を見直す必要があります。
      </div>`}
    <div class="summary-grid">
      <div class="panel"><span>通常生成</span>
        <strong>${formatNumber(report.sampleCount)}問</strong>
        <span>同一seed系列、変形なし</span></div>
      <div class="panel"><span>全filter通過</span>
        <strong>${formatNumber(passed.count)}問</strong>
        <span>${formatPercent(passed.rate)}</span></div>
      ${report.showRejectedSummaryPanel === false
        ? ""
        : `<div class="panel"><span>いずれかで却下</span>
          <strong>${formatNumber(rejected.count)}問</strong>
          <span>${formatPercent(rejected.rate)}</span></div>`}
      <div class="panel"><span>${formatNumber(
        report.sampleCount,
      )}問の生成時間</span>
        <strong>${formatNumber(report.timing.elapsedSeconds)}秒</strong>
        <span>平均 ${
          formatNumber(report.timing.averageMsPerPuzzle)
        }ms / 問</span></div>
    </div>

    ${report.combineClassificationSummaryIntoConditionTable === true
      ? ""
      : `<h3>filter前・全通過・却下群の難易度分類</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>分類</th>
          <th>filter前 ${formatNumber(report.sampleCount)}問</th>
          <th>全filter通過 ${formatNumber(passed.count)}問</th>
          <th>いずれかで却下 ${formatNumber(rejected.count)}問</th>
        </tr></thead>
        <tbody>${classificationRows}</tbody>
      </table></div>
      ${report.showFilterTableNotes === false
        ? ""
        : `<p class="table-note">率の分母は各列の問題数です。
        「指標混合」はdirection scoreの符号で簡単寄り／難しい寄りに
        分けています。これは人間の体感評価ではありません。</p>`}`}

    <div class="heading-with-action">
      <h3>条件ごとの違反問題数と、違反群の分類内訳</h3>
      ${report.showConditionCopyButton === true
        ? `<button type="button" class="copy-conditions"
          data-copy-lines="${conditionCopyLines}">条件一覧をコピー</button>`
        : ""}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>条件</th>
        <th>${formatNumber(report.sampleCount)}問中の問題数</th>
        ${groups.map(group =>
          `<th>${escapeHtml(group.label)}</th>`
        ).join("")}
      </tr></thead>
      <tbody>${conditionRows}${
        report.combineClassificationSummaryIntoConditionTable === true
          ? filterBeforeRow
          : ""
      }${allFiltersPassedRow}</tbody>
    </table></div>
    ${report.showFilterTableNotes === false
      ? ""
      : `<p class="table-note">各分類率の分母は、その行の違反問題数です。
      同じ問題が複数条件に違反すれば複数行へ数えるため、違反数の合計は
      ${formatNumber(report.sampleCount)}問にはなりません。最下行の
      「全filter通過」だけは、違反群ではなく6条件をすべて通過した問題の
      分類内訳です。</p>`}
  </section>`;
}

function renderRateCell(count, rate) {
  return `<td class="number-cell"><strong>${formatNumber(count)}問</strong>
    <small>${formatPercent(rate)}</small></td>`;
}

function renderExperimentSummary(report) {
  const experiment = report.experiment;
  const sampling = experiment.sampling;
  const comparison = experiment.classificationComparison;
  const cohortSize = formatNumber(report.samplesPerProfile);
  const matchByClassification =
    experiment.baselineHypothesisMatchByClassification;
  const placement = experiment.placementComparison;
  const conditionRejections = experiment.conditionRejections;
  const constructionPruning = experiment.constructionPruning;
  const labels = {
    reference_like: "原本近傍",
    clearly_easier: "明らかに簡単側",
    clearly_harder: "明らかに難しい側",
    mixed: "指標混合",
  };
  return `<section>
    <h2 class="section-heading">仮説と比較結果</h2>
    <div class="warning">
      <strong>最終条件</strong>
      ${escapeHtml(experiment.hypotheses.combined.description)}
      ${escapeHtml(experiment.hypotheses.terminalRunAndBlock.description)}
      ${escapeHtml(
        experiment.hypotheses.centralBoundaryAdjacency.description,
      )}
      ${escapeHtml(
        experiment.hypotheses.concentratedOrthogonalEdgePairs.description,
      )}
      原本問題は、この最終条件を満たします。
    </div>
    <div class="summary-grid">
      <div class="panel">
        <span>生成policy通過${cohortSize}問の中央条件通過率</span>
        <strong>${formatPercent(
          sampling.baselineCentralMatchRate,
        )}</strong>
        <span>${formatNumber(sampling.baselineCentralMatchCount)}問</span>
      </div>
      <div class="panel">
        <span>生成policy通過${cohortSize}問の最終条件通過率</span>
        <strong>${formatPercent(
          sampling.baselineFinalMatchRate,
        )}</strong>
        <span>${formatNumber(sampling.baselineFinalMatchCount)}問</span>
      </div>
      <div class="panel">
        <span>最終条件${cohortSize}問を集めるまで</span>
        <strong>${formatNumber(
          sampling.targetProfileEncounterCount,
        )}問</strong>
        <span>level 2生成試行 ${formatNumber(
          sampling.levelTwoRequestCount,
        )}回</span>
      </div>
      <div class="panel">
        <span>6x6-4-4-2内の最終条件通過率</span>
        <strong>${formatPercent(
          sampling.targetProfileFinalAcceptanceRate,
        )}</strong>
        <span>配置条件6〜10の追加前 ${formatPercent(
          sampling.targetProfileCombinedAcceptanceRate,
        )}</span>
      </div>
    </div>
    <h3>条件ごとの却下率</h3>
    <p class="note">
      単独却下率は、他の条件を無視して各条件だけを全候補へ当てた値です。
      同じ候補が複数行で却下されるため合計は100%になりません。
      段階却下率は、表の上から条件を適用し、その条件まで到達した候補のうち
      何%を追加で却下したかを示します。どの条件が実際にゲートを狭めたかは、
      主に段階却下率と条件後の残存数で確認します。
    </p>
    <div class="table-wrap">
      <table><thead><tr>
        <th>順</th><th>条件</th><th>単独却下</th><th>単独却下率</th>
        <th>段階到達</th><th>その条件で却下</th><th>段階却下率</th>
        <th>条件後の残存</th>
      </tr></thead><tbody>${
        conditionRejections.map(rule => `<tr>
          <td>${formatNumber(rule.order)}</td>
          <td class="condition-cell"><strong>${escapeHtml(rule.label)}</strong>
            <small>${escapeHtml(rule.description)}</small></td>
          <td>${formatNumber(rule.standaloneRejectedCount)}問</td>
          <td>${formatPercent(rule.standaloneRejectionRate)}</td>
          <td>${formatNumber(rule.reachedCount)}問</td>
          <td>${formatNumber(rule.sequentialRejectedCount)}問</td>
          <td>${formatPercent(rule.sequentialRejectionRate)}</td>
          <td>${formatNumber(rule.remainingCount)}問（${
            formatPercent(rule.remainingRate)
          }）</td>
        </tr>`).join("")
      }</tbody></table>
    </div>
    ${constructionPruning === undefined
      ? ""
      : `<h3>生成探索内の剪定率</h3>
    <p class="note">
      上の完成盤面に対する却下率とは分母が異なります。
      経路条件は採用問題のroute cover探索枝、記号条件は完成coverへ試した
      記号割当てを分母にしています。同じ探索枝が複数条件に該当するため、
      剪定率の合計は100%になりません。
    </p>
    <div class="table-wrap">
      <table><thead><tr>
        <th>段階</th><th>条件</th><th>評価数</th><th>除外数</th>
        <th>剪定率</th>
      </tr></thead><tbody>${
        constructionPruning.rules.map(rule => `<tr>
          <td>${rule.stage === "path_extension"
            ? "経路探索"
            : "記号割当て"}</td>
          <td class="condition-cell">${escapeHtml(rule.label)}</td>
          <td>${formatNumber(rule.evaluatedCount)}</td>
          <td>${formatNumber(rule.prunedCount)}</td>
          <td>${formatPercent(rule.pruningRate)}</td>
        </tr>`).join("")
      }</tbody></table>
    </div>`}
    <h3>難易度分類の変化</h3>
    <table><thead><tr>
      <th>分類</th><th>生成policy通過</th><th>中央記号網羅</th>
      <th>前回条件</th><th>中央3〜5追加</th>
      <th>中央隣接制限</th><th>今回の最終条件</th>
      <th>生成policy通過群との差</th>
    </tr></thead><tbody>${
      Object.entries(comparison).map(([classification, value]) => `<tr>
        <td>${escapeHtml(labels[classification])}</td>
        <td>${formatNumber(value.baseline.count)}問（${
          formatPercent(value.baseline.ratio)
        }）</td>
        <td>${formatNumber(value.central.count)}問（${
          formatPercent(value.central.ratio)
        }）</td>
        <td>${formatNumber(value.previousCombined.count)}問（${
          formatPercent(value.previousCombined.ratio)
        }）</td>
        <td>${formatNumber(value.boundedCentral.count)}問（${
          formatPercent(value.boundedCentral.ratio)
        }）</td>
        <td>${formatNumber(value.combined.count)}問（${
          formatPercent(value.combined.ratio)
        }）</td>
        <td>${formatNumber(value.final.count)}問（${
          formatPercent(value.final.ratio)
        }）</td>
        <td>${formatPercentagePoint(
          value.finalRatioPointChange,
        )}</td>
      </tr>`).join("")
    }</tbody></table>
    <h3>生成policy通過${cohortSize}問における、仮説条件との関係</h3>
    <table><thead><tr>
      <th>分類</th><th>問題数</th>
      <th>配置条件6〜10の追加前</th><th>追加前通過率</th>
      <th>最終条件</th><th>最終通過率</th>
    </tr></thead><tbody>${
      Object.entries(matchByClassification)
        .map(([classification, value]) => `<tr>
          <td>${escapeHtml(labels[classification])}</td>
          <td>${formatNumber(value.totalCount)}</td>
          <td>${formatNumber(value.combinedMatchCount)}</td>
          <td>${value.combinedMatchRate === null
            ? "—"
            : formatPercent(value.combinedMatchRate)}</td>
          <td>${formatNumber(value.finalMatchCount)}</td>
          <td>${value.finalMatchRate === null
            ? "—"
            : formatPercent(value.finalMatchRate)}</td>
        </tr>`).join("")
    }</tbody></table>
    <h3>端点位置の変化</h3>
    <table><thead><tr>
      <th>指標</th><th>生成policy通過</th><th>中央記号網羅</th>
      <th>前回条件</th><th>中央3〜5追加</th>
      <th>中央隣接制限</th><th>今回の最終条件</th>
    </tr></thead><tbody>
      ${renderPlacementComparisonRow(
        "中央4×4の端点数",
        placement.baseline.centralTerminalCount,
        placement.central.centralTerminalCount,
        placement.previousCombined.centralTerminalCount,
        placement.boundedCentral.centralTerminalCount,
        placement.combined.centralTerminalCount,
        placement.final.centralTerminalCount,
      )}
      ${renderPlacementComparisonRow(
        "外周の端点数",
        placement.baseline.outerRingTerminalCount,
        placement.central.outerRingTerminalCount,
        placement.previousCombined.outerRingTerminalCount,
        placement.boundedCentral.outerRingTerminalCount,
        placement.combined.outerRingTerminalCount,
        placement.final.outerRingTerminalCount,
      )}
      ${renderPlacementComparisonRow(
        "外周で隣接する端点pair数",
        placement.baseline.adjacentEdgeTerminalPairCount,
        placement.central.adjacentEdgeTerminalPairCount,
        placement.previousCombined.adjacentEdgeTerminalPairCount,
        placement.boundedCentral.adjacentEdgeTerminalPairCount,
        placement.combined.adjacentEdgeTerminalPairCount,
        placement.final.adjacentEdgeTerminalPairCount,
      )}
      ${renderPlacementComparisonRow(
        "うち同記号の隣接pair数",
        placement.baseline.adjacentSameSymbolEdgePairCount,
        placement.central.adjacentSameSymbolEdgePairCount,
        placement.previousCombined.adjacentSameSymbolEdgePairCount,
        placement.boundedCentral.adjacentSameSymbolEdgePairCount,
        placement.combined.adjacentSameSymbolEdgePairCount,
        placement.final.adjacentSameSymbolEdgePairCount,
      )}
      ${renderPlacementComparisonRow(
        "中央4×4内で隣接する端点pair数",
        placement.baseline.adjacentCentralTerminalPairCount,
        placement.central.adjacentCentralTerminalPairCount,
        placement.previousCombined.adjacentCentralTerminalPairCount,
        placement.boundedCentral.adjacentCentralTerminalPairCount,
        placement.combined.adjacentCentralTerminalPairCount,
        placement.final.adjacentCentralTerminalPairCount,
      )}
      ${renderPlacementComparisonRow(
        "盤面全体の最大隣接端点数",
        placement.baseline.maximumAdjacentTerminalClusterSize,
        placement.central.maximumAdjacentTerminalClusterSize,
        placement.previousCombined.maximumAdjacentTerminalClusterSize,
        placement.boundedCentral.maximumAdjacentTerminalClusterSize,
        placement.combined.maximumAdjacentTerminalClusterSize,
        placement.final.maximumAdjacentTerminalClusterSize,
      )}
      ${renderPlacementComparisonRow(
        "中央4×4と外周をまたぐ隣接pair数",
        placement.baseline.centralBoundaryAdjacentTerminalPairCount,
        placement.central.centralBoundaryAdjacentTerminalPairCount,
        placement.previousCombined
          .centralBoundaryAdjacentTerminalPairCount,
        placement.boundedCentral
          .centralBoundaryAdjacentTerminalPairCount,
        placement.combined.centralBoundaryAdjacentTerminalPairCount,
        placement.final.centralBoundaryAdjacentTerminalPairCount,
      )}
      ${renderPlacementComparisonRow(
        "横3連の数",
        placement.baseline.horizontalThreeTerminalRunCount,
        placement.central.horizontalThreeTerminalRunCount,
        placement.previousCombined.horizontalThreeTerminalRunCount,
        placement.boundedCentral.horizontalThreeTerminalRunCount,
        placement.combined.horizontalThreeTerminalRunCount,
        placement.final.horizontalThreeTerminalRunCount,
      )}
      ${renderPlacementComparisonRow(
        "縦3連の数",
        placement.baseline.verticalThreeTerminalRunCount,
        placement.central.verticalThreeTerminalRunCount,
        placement.previousCombined.verticalThreeTerminalRunCount,
        placement.boundedCentral.verticalThreeTerminalRunCount,
        placement.combined.verticalThreeTerminalRunCount,
        placement.final.verticalThreeTerminalRunCount,
      )}
      ${renderPlacementComparisonRow(
        "端点で埋まる2×2の数",
        placement.baseline.filledTwoByTwoTerminalBlockCount,
        placement.central.filledTwoByTwoTerminalBlockCount,
        placement.previousCombined.filledTwoByTwoTerminalBlockCount,
        placement.boundedCentral.filledTwoByTwoTerminalBlockCount,
        placement.combined.filledTwoByTwoTerminalBlockCount,
        placement.final.filledTwoByTwoTerminalBlockCount,
      )}
      ${renderPlacementComparisonRow(
        "L字型3連の数",
        placement.baseline.lShapedThreeTerminalBlockCount,
        placement.central.lShapedThreeTerminalBlockCount,
        placement.previousCombined.lShapedThreeTerminalBlockCount,
        placement.boundedCentral.lShapedThreeTerminalBlockCount,
        placement.combined.lShapedThreeTerminalBlockCount,
        placement.final.lShapedThreeTerminalBlockCount,
      )}
      ${renderPlacementComparisonRow(
        "一辺に集中した直交隣接pairの最大数",
        placement.baseline.maximumOrthogonalEdgeTerminalPairCount,
        placement.central.maximumOrthogonalEdgeTerminalPairCount,
        placement.previousCombined.maximumOrthogonalEdgeTerminalPairCount,
        placement.boundedCentral.maximumOrthogonalEdgeTerminalPairCount,
        placement.combined.maximumOrthogonalEdgeTerminalPairCount,
        placement.final.maximumOrthogonalEdgeTerminalPairCount,
      )}
    </tbody></table>
  </section>`;
}

function renderPlacementComparisonRow(
  label,
  baseline,
  central,
  previousCombined,
  boundedCentral,
  combined,
  final,
) {
  return `<tr>
    <td>${escapeHtml(label)}</td>
    <td>${formatNumber(baseline.average)}</td>
    <td>${formatNumber(central.average)}</td>
    <td>${formatNumber(previousCombined.average)}</td>
    <td>${formatNumber(boundedCentral.average)}</td>
    <td>${formatNumber(combined.average)}</td>
    <td>${formatNumber(final.average)}</td>
  </tr>`;
}

function renderPlacement(placement) {
  return `<p class="metrics">中央4×4: ${
    formatNumber(placement.centralTerminalCount)
  }端点 / 外周: ${formatNumber(placement.outerRingTerminalCount)}端点 /
  外周の記号隣接: ${
    formatNumber(placement.adjacentEdgeTerminalPairCount)
  }pair（同記号 ${
    formatNumber(placement.adjacentSameSymbolEdgePairCount)
  }pair） / 中央の記号隣接: ${
    formatNumber(placement.adjacentCentralTerminalPairCount)
  }pair / 盤面全体の最大隣接端点数: ${
    formatNumber(placement.maximumAdjacentTerminalClusterSize)
  }個 / 中央外周境界の隣接: ${
    formatNumber(placement.centralBoundaryAdjacentTerminalPairCount)
  }pair / 横3連: ${
    formatNumber(placement.horizontalThreeTerminalRunCount)
  } / 縦3連: ${
    formatNumber(placement.verticalThreeTerminalRunCount)
  } / 2×2: ${
    formatNumber(placement.filledTwoByTwoTerminalBlockCount)
  } / L字3連: ${
    formatNumber(placement.lShapedThreeTerminalBlockCount)
  } / 一辺集中の直交隣接pair最大: ${
    formatNumber(placement.maximumOrthogonalEdgeTerminalPairCount)
  } /
  中央の記号別: ${
    Object.entries(placement.centralSymbolCounts)
      .map(([symbol, count]) => `${escapeHtml(symbol)}=${formatNumber(count)}`)
      .join(" / ")
  }</p>`;
}

function renderMetrics(metrics, referenceMetrics) {
  const rows = [
    ["初期選択肢量", "entryHypothesisCount"],
    ["強制出口", "forcedExitCount"],
    ["solver状態", "solverStateCount"],
    ["solver backtrack", "solverBacktrackCount"],
    ["総曲がり", "totalTurnCount"],
    ["使用マス", "usedCellCount"],
    ["行列集中", "maximumLineConcentration"],
    ["pairing候補", "pairingChoiceCount"],
  ];
  return `<table class="metrics">
    <thead><tr><th>指標</th><th>問題</th>${
      referenceMetrics === null ? "" : "<th>原本</th>"
    }</tr></thead>
    <tbody>${rows.map(([label, key]) => `<tr>
      <td>${escapeHtml(label)}</td>
      <td>${formatNumber(metrics[key])}</td>
      ${referenceMetrics === null
        ? ""
        : `<td>${formatNumber(referenceMetrics[key])}</td>`}
    </tr>`).join("")}</tbody>
  </table>`;
}

function renderPercentileTable(percentiles) {
  const labels = {
    entryHypothesisCount: "初期選択肢量",
    forcedExitCount: "強制出口",
    solverStateCount: "solver状態",
    solverBacktrackCount: "solver backtrack",
    totalTurnCount: "総曲がり",
    usedCellCount: "使用マス",
  };
  return `<table><thead><tr><th>指標</th><th>percentile</th></tr></thead>
    <tbody>${Object.entries(percentiles).map(([key, value]) => `<tr>
      <td>${escapeHtml(labels[key])}</td><td>${formatPercent(value)}</td>
    </tr>`).join("")}</tbody></table>`;
}

function renderDistributionTable(distributions, referenceMetrics) {
  const labels = {
    entryHypothesisCount: "初期選択肢量",
    forcedExitCount: "強制出口",
    solverStateCount: "solver状態",
    solverBacktrackCount: "solver backtrack",
    totalTurnCount: "総曲がり",
    usedCellCount: "使用マス",
    maximumLineConcentration: "行列集中",
  };
  return `<table><thead><tr>
    <th>指標</th><th>原本</th><th>min</th><th>p05</th><th>中央値</th>
    <th>p95</th><th>max</th>
  </tr></thead><tbody>${
    Object.entries(distributions).map(([key, value]) => `<tr>
      <td>${escapeHtml(labels[key])}</td>
      <td>${formatNumber(referenceMetrics[key])}</td>
      <td>${formatNumber(value.minimum)}</td>
      <td>${formatNumber(value.p05)}</td>
      <td>${formatNumber(value.median)}</td>
      <td>${formatNumber(value.p95)}</td>
      <td>${formatNumber(value.maximum)}</td>
    </tr>`).join("")
  }</tbody></table>`;
}

function renderBoard(puzzle, solution = null) {
  const cellSize = 64;
  const inset = 8;
  const width = puzzle.width * cellSize + inset * 2;
  const height = puzzle.height * cellSize + inset * 2;
  const grid = [];
  for (let column = 0; column <= puzzle.width; column += 1) {
    const x = inset + column * cellSize;
    grid.push(`<line x1="${x}" y1="${inset}" x2="${x}" y2="${
      height - inset
    }"/>`);
  }
  for (let row = 0; row <= puzzle.height; row += 1) {
    const y = inset + row * cellSize;
    grid.push(`<line x1="${inset}" y1="${y}" x2="${
      width - inset
    }" y2="${y}"/>`);
  }
  const paths = solution === null ? "" : solution.paths.map(path => {
    const points = path.cells.map(cell => {
      const x = inset + cell.column * cellSize + cellSize / 2;
      const y = inset + cell.row * cellSize + cellSize / 2;
      return `${x},${y}`;
    }).join(" ");
    return `<polyline points="${points}" fill="none" stroke="#263b37"
      stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("");
  const terminals = puzzle.terminals.map(terminal => {
    const x = inset + terminal.column * cellSize + cellSize / 2;
    const y = inset + terminal.row * cellSize + cellSize / 2;
    if (terminal.symbol === "circle") {
      return `<circle cx="${x}" cy="${y}" r="18" fill="#fff"
        stroke="#c65d36" stroke-width="6"/>`;
    }
    if (terminal.symbol === "square") {
      return `<rect x="${x - 18}" y="${y - 18}" width="36" height="36"
        rx="2" fill="#fff" stroke="#c65d36" stroke-width="6"/>`;
    }
    return `<polygon points="${x},${y - 21} ${x - 21},${y + 18} ${
      x + 21
    },${y + 18}" fill="#fff" stroke="#c65d36" stroke-width="6"
      stroke-linejoin="round"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img"
    aria-label="${puzzle.width}×${puzzle.height}、端点${
      puzzle.terminals.length
    }個">
    <g stroke="#9aaaa6" stroke-width="1.5">${grid.join("")}</g>
    ${paths}
    ${terminals}
  </svg>`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 3,
  }).format(value);
}

function formatPercent(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercentagePoint(value) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value * 100)}ポイント`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function serializeForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
