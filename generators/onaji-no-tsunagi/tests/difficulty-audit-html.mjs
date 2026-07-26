/**
 * 6×6難易度監査の集計とレビュー標本を、自己完結したHTMLへ描画する。
 *
 * 問題を先に見てから答えを開ける構成とし、入力した人間レビューは
 * browserのlocalStorageへ保存してJSONとして書き出せる。
 */

/**
 * 難易度監査reportを、外部asset不要の人間レビュー用HTMLへ変換する。
 *
 * review入力は生成HTMLのlocalStorageに保存し、JSONとして書き出せる。
 * report自体や入力内容をリポジトリへ保存する処理は行わない。
 */
export function renderDifficultyAuditHtml(report) {
  const sections = Object.entries(report.byProfile)
    .map(([profileId, summary]) => renderProfileSection(profileId, summary))
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
    @media (max-width: 620px) {
      main { padding-inline: 12px; }
      .candidate-grid { grid-template-columns: 1fr; }
      th, td { padding: 6px; font-size: .85rem; }
    }
  </style>
</head>
<body>
<main>
  <div class="toolbar">
    <span>${escapeHtml(toolbarSummary)}</span>
    <button id="export-review" type="button">レビュー結果をJSON保存</button>
  </div>
  <h1>${escapeHtml(reportTitle)}</h1>
  <p class="lead">${escapeHtml(lead)}</p>
  <div class="warning">
    <strong>これは体感難易度の自動判定ではありません。</strong>
    ${escapeHtml(report.classificationPolicy.disclaimer)}
    「原本近傍」は4指標中3つ以上が許容帯内、「明らかに簡単側／難しい側」は
    2つ以上が同じ方向を示し、反対方向の指標がない問題だけです。
  </div>
  <p class="note">レポート版: ${escapeHtml(report.schemaVersion)} /
  原本SHA-256: <span class="seed">${
    escapeHtml(report.referenceCorpus.sourceDocumentSha256 ?? "未登録")
  }</span></p>
  ${report.experiment === undefined
    ? ""
    : renderExperimentSummary(report)}
  ${sections}
</main>
<script>
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
</script>
</body>
</html>`;
}

function renderProfileSection(profileId, summary) {
  const reference = summary.reference;
  const counts = summary.classificationCounts;
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
    <h3>原本基準点（表示レベル${
      escapeHtml(String(reference.source.printedDifficulty))
    }）</h3>
    <div class="candidate-grid">
      ${renderReferenceCard(reference)}
      <div class="panel">
        <h3>原本の生成分布内percentile</h3>
        ${renderPercentileTable(summary.referencePercentiles)}
        <p class="note">値以下の生成問題が何割あるかを示します。強制出口は
        多いほど簡単側とみなすため、percentileの向きだけで難易度を判断しません。</p>
      </div>
    </div>
    <h3>生成分布</h3>
    ${renderDistributionTable(summary.generatedDistributions, reference.metrics)}
    ${candidateGroups.map(([label, key]) => {
      const candidates = summary.reviewCandidates[key];
      if (candidates.length === 0) {
        return `<h3 class="candidate-heading">${label}</h3>
          <p>該当するレビュー候補はありません。</p>`;
      }
      return `<h3 class="candidate-heading">${label}</h3>
        <div class="candidate-grid">
          ${candidates.map(candidate => renderCandidateCard(
            candidate,
            reference,
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

function renderReferenceCard(reference) {
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

function renderCandidateCard(candidate, reference) {
  const labels = {
    reference_like: "原本近傍",
    clearly_easier: "明らかに簡単側",
    clearly_harder: "明らかに難しい側",
    mixed: "指標混合",
  };
  return `<article class="review-card" data-review-id="${
    escapeHtml(candidate.id)
  }">
    <span class="badge ${escapeHtml(candidate.classification)}">${
      escapeHtml(labels[candidate.classification])
    }</span>
    <span class="badge">score ${candidate.directionScore}</span>
    <h3 class="seed">${escapeHtml(candidate.seed)}</h3>
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
    <label>人間の判断
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
    </label>
  </article>`;
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
