import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const generatorBase = new URL("../", import.meta.url);
const rootBase = new URL("../../../", import.meta.url);
const [
  page,
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
] = await Promise.all([
  readFile(new URL("ui/OnajiNoTsunagiPage.tsx", generatorBase), "utf8"),
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
]);

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
  "5×5・6/8/10端点・唯一解を完全探索で証明済み",
  "レベル2〜4の唯一解文法は準備中",
  "挑戦したくなるか／解いて面白いかは人間未確認",
  "難易度は未校正",
  "児童利用・学力判定不可",
  "この条件でつくる",
  "ランダムseed",
  "答えを表示",
  "ペアリングも含め",
]) {
  assert.match(page, new RegExp(text), `page must contain: ${text}`);
}

assert.match(page, /new Worker/);
assert.match(page, /generation-worker\.ts/);
assert.match(page, /worker\.postMessage\(input\)/);
assert.match(page, /window\.requestAnimationFrame/);
assert.match(page, /onClick=\{handlePrint\}/);
assert.match(page, /globalThis\.crypto\.getRandomValues/);
assert.match(page, /activeWorker\.current\?\.terminate/);
assert.match(workerSource, /generateWorksheetUseCase\(event\.data\)/);
assert.match(workerSource, /generationErrorMessage/);
assert.match(page, /<AnswerPreview worksheet=\{pageState\.worksheet\} hidden=\{!showAnswers\} \/>/);
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
assert.match(board, /<svg/);
assert.match(board, /<polyline/);
assert.match(board, /solution\?\.paths/);
assert.match(board, /terminal\.symbol === ["']circle["']/);
assert.match(board, /terminal\.symbol === ["']triangle["']/);
assert.match(board, /terminal\.symbol === ["']square["']/);

assert.match(css, /@page\s*\{[\s\S]*size:\s*A4 portrait/);
assert.match(css, /@media print/);
assert.match(css, /\.screen-only\s*\{[\s\S]*display:\s*none\s*!important/);
assert.match(css, /\.ots-sheet\s*\{[\s\S]*break-after:\s*page/);
assert.match(css, /\.ots-answer-screen-hidden\s*\{[\s\S]*display:\s*block/);
assert.match(css, /\.ots-answer-line--1\s*\{[\s\S]*stroke-dasharray/);

console.log("onaji-no-tsunagi React UI structure tests passed");
