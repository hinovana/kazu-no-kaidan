import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const generatorBase = new URL("../", import.meta.url);
const rootBase = new URL("../../../", import.meta.url);
const [
  page,
  generationControls,
  generationHook,
  board,
  problemPreview,
  answerPreview,
  diagnostics,
  moduleSource,
  css,
  registry,
  app,
  redirect,
  legacyHtml,
  workerSource,
  referenceReview,
  referenceDecoder,
] = await Promise.all([
  readFile(new URL("ui/OnajiNoTsunagiPage.tsx", generatorBase), "utf8"),
  readFile(new URL("ui/WorksheetGenerationControls.tsx", generatorBase), "utf8"),
  readFile(new URL("ui/use-worksheet-generation.ts", generatorBase), "utf8"),
  readFile(new URL("ui/PuzzleBoard.tsx", generatorBase), "utf8"),
  readFile(new URL("ui/WorksheetPreview.tsx", generatorBase), "utf8"),
  readFile(new URL("ui/AnswerPreview.tsx", generatorBase), "utf8"),
  readFile(new URL("ui/DeveloperDiagnostics.tsx", generatorBase), "utf8"),
  readFile(new URL("module.tsx", generatorBase), "utf8"),
  readFile(new URL("styles.css", generatorBase), "utf8"),
  readFile(new URL("src/app/generator-registry.ts", rootBase), "utf8"),
  readFile(new URL("src/app/App.tsx", rootBase), "utf8"),
  readFile(new URL("redirect.ts", generatorBase), "utf8"),
  readFile(new URL("index.html", generatorBase), "utf8"),
  readFile(new URL("application/generation-worker.ts", generatorBase), "utf8"),
  readFile(new URL("ui/ReferenceCorpusReviewPage.tsx", generatorBase), "utf8"),
  readFile(new URL("application/decode-reference-corpus.ts", generatorBase), "utf8"),
]);
const generatorPageSource = [
  page,
  generationControls,
  generationHook,
].join("\n");

assert.match(moduleSource, /satisfies LoadedGeneratorModule/);
assert.match(moduleSource, /OnajiNoTsunagiPage/);
assert.match(registry, /id:\s*["']onaji-no-tsunagi["']/);
assert.match(registry, /import\(["']\.\.\/\.\.\/generators\/onaji-no-tsunagi\/module\.tsx["']\)/);
assert.match(app, /generatorRegistry\.flatMap/);
assert.match(app, /entry\.kind !== ["']react["']/);
assert.match(app, /entry\.load\(\)/);
assert.doesNotMatch(app, /requireReactEntry/);
assert.match(legacyHtml, /#\/generators\/onaji-no-tsunagi/);
assert.match(redirect, /\/generators\/onaji-no-tsunagi/);
assert.match(redirect, /window\.location\.replace/);

for (const text of [
  "開発確認用プロトタイプ",
  "v3.4 draft: 5×5・6×6・6/8/10/12/14端点・唯一解を完全探索で証明済み",
  "6×6の機械gateは完了",
  "6×6・10/12個・唯一解",
  "6×6・14個・唯一解",
  "挑戦したくなるか／解いて面白いかは人間未確認",
  "難易度は未校正",
  "児童利用・学力判定不可",
  "この条件でつくる",
  "ランダムseed",
  "答えを表示",
  "ペアリングも含め",
  "お手本JSONを盤面で確認",
]) {
  assert.match(
    generatorPageSource,
    new RegExp(text),
    `page modules must contain: ${text}`,
  );
}

assert.match(generationHook, /new Worker/);
assert.match(generationHook, /generation-worker\.ts/);
assert.doesNotMatch(generatorPageSource, /generation-v34-review-worker\.ts/);
assert.doesNotMatch(generatorPageSource, /mode=v34-review/);
assert.doesNotMatch(generatorPageSource, /reviewMode/);
assert.match(generationHook, /worker\.postMessage\(input\)/);
assert.match(page, /window\.requestAnimationFrame/);
assert.match(page, /onPrint=\{handlePrint\}/);
assert.match(generationControls, /onClick=\{onPrint\}/);
assert.match(generationControls, /globalThis\.crypto\.getRandomValues/);
assert.match(generationHook, /activeWorker\.current\?\.terminate/);
assert.match(workerSource, /generateWorksheetUseCase\(event\.data\)/);
assert.match(workerSource, /generationErrorMessage/);
assert.match(page, /<AnswerPreview worksheet=\{state\.worksheet\} hidden=\{!showAnswers\} \/>/);
assert.match(problemPreview, /solution=\{null\}/);
assert.match(answerPreview, /solution=\{generated\.canonicalSolution\}/);
assert.match(answerPreview, /どの2こを組にするかと線の通り方を含めて、答えは1通りです/);
assert.doesNotMatch(answerPreview, /別のつなぎ方も正解/);
assert.doesNotMatch(answerPreview, /解答例/);
assert.match(diagnostics, /唯一解の使用マス/);
assert.match(diagnostics, /唯一性証明状態/);
assert.match(diagnostics, /局所的な強制出口/);
assert.match(diagnostics, /端点構成/);
assert.match(diagnostics, /ペアリング候補/);
assert.match(diagnostics, /同一行・列の最大端点/);
assert.match(diagnostics, /証明済み相互作用/);
assert.match(diagnostics, /最適性証明状態/);
assert.match(diagnostics, /採用candidate/);
assert.match(diagnostics, /到達不能枝の除外/);
assert.match(diagnostics, /構成状態/);
assert.match(diagnostics, /最大判断深さ/);
assert.match(diagnostics, /成分偶奇枝の除外/);
assert.match(diagnostics, /失敗memo枝の除外/);
assert.match(diagnostics, /profile/);
assert.match(diagnostics, /経路長/);
assert.match(board, /<svg/);
assert.match(board, /<polyline/);
assert.match(board, /solution\?\.paths/);
assert.match(board, /showCoordinates/);
assert.match(board, /ots-cell-coordinate/);
assert.match(board, /terminal\.symbol === ["']circle["']/);
assert.match(board, /terminal\.symbol === ["']triangle["']/);
assert.match(board, /terminal\.symbol === ["']square["']/);
assert.doesNotMatch(board, /ots-answer-line--/);

assert.match(css, /@page\s*\{[\s\S]*size:\s*A4 portrait/);
assert.match(css, /@media print/);
assert.match(css, /\.screen-only\s*\{[\s\S]*display:\s*none\s*!important/);
assert.match(css, /\.ots-sheet\s*\{[\s\S]*break-after:\s*page/);
assert.match(css, /\.ots-answer-screen-hidden\s*\{[\s\S]*display:\s*block/);
assert.match(css, /\.ots-answer-line\s*\{[\s\S]*stroke-linecap:\s*round/);
assert.match(css, /\.ots-answer-line\s*\{[\s\S]*stroke-linejoin:\s*round/);
assert.match(css, /\.ots-answer-line\s*\{[\s\S]*shape-rendering:\s*geometricPrecision/);
assert.doesNotMatch(css, /\.ots-answer-line--/);
assert.match(referenceReview, /お手本JSON 盤面確認/);
assert.match(referenceReview, /type=["']file["']/);
assert.match(referenceReview, /accept=["']\.json,application\/json["']/);
assert.match(referenceReview, /decodeReferenceCorpusJson/);
assert.match(referenceReview, /referenceProblemToPuzzle/);
assert.match(referenceReview, /showCoordinates/);
assert.match(referenceReview, /JSON座標を表で確認/);
assert.match(referenceReview, /原本との一致そのものは人間が目視確認/);
assert.match(referenceReview, /架空の形式見本を表示/);
assert.match(referenceReview, /原本PDFが同じファイルか確認/);
assert.match(referenceReview, /globalThis\.crypto\.subtle\.digest/);
assert.match(referenceReview, /JSONと同じ原本PDFです/);
assert.match(referenceReview, /JSONが指す原本PDFと一致しません/);
assert.match(referenceDecoder, /checkKeys/);
assert.match(referenceDecoder, /validatePuzzle/);
assert.match(referenceDecoder, /同じ出典位置が重複/);
assert.match(referenceDecoder, /checkedAgainstSourceSha256/);
assert.match(css, /\.ots-reference-grid/);
assert.match(css, /\.ots-transcription-status--double-checked/);
assert.match(css, /\.ots-pdf-check-result--match/);

console.log("onaji-no-tsunagi React UI structure tests passed");
