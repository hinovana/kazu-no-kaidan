import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = new URL("../", import.meta.url);
const [html, css, app, aiProxyClient] = await Promise.all([
  readFile(new URL("index.html", base), "utf8"),
  readFile(new URL("styles.css", base), "utf8"),
  readFile(new URL("src/app.js", base), "utf8"),
  readFile(new URL("src/ai-proxy-client.js", base), "utf8"),
]);

for (const id of [
  "generatorForm",
  "gradeSelect",
  "profileSelect",
  "lengthSelect",
  "topicSelect",
  "generationModeLocal",
  "generationModeAi",
  "generationModeHelp",
  "aiProxyFields",
  "aiProxyUrlInput",
  "aiProxyCheckButton",
  "aiProxyStatus",
  "aiProxyDetails",
  "seedInput",
  "seedHelp",
  "seedRandomButton",
  "generateButton",
  "worksheet",
  "answerToggle",
  "answerPanel",
  "evidenceToggle",
  "evidencePanel",
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `UI must expose #${id}`);
}

assert.match(html, /生成条件プロファイル/);
assert.match(html, /実測した難易度ではありません/);
assert.match(html, /構造的自動検査通過・人間未確認/);
assert.match(html, /開発確認用プロトタイプ／児童利用・学力判定不可/);
assert.match(html, /語彙・文法の学年適合性は未検証/);
assert.doesNotMatch(html, /id=["']worksheet["'][^>]*aria-live/);
assert.match(html, /aria-expanded="false"/);
for (const topic of ["auto", "school", "home", "nature", "town", "animal"]) {
  assert.match(html, new RegExp(`value=["']${topic}["']`), `topic option ${topic} must be present`);
}
for (const length of ["short", "standard", "long"]) {
  assert.match(html, new RegExp(`value=["']${length}["']`), `length option ${length} must be present`);
}
assert.match(html, /<html[^>]*data-print-layout=["']vertical["']/);
assert.doesNotMatch(html, /printLayoutSelect|横書き（A4横）/);
assert.match(html, /ランダムseed/);
assert.match(html, /value=["']local["'][^>]*checked/);
assert.match(html, /value=["']ai_proxy["']/);
assert.match(html, /以下の条件は、どちらの生成方式でも使います/);
assert.match(html, /http:\/\/127\.0\.0\.1:8787/);
assert.match(html, /APIキーはここへ入力しません/);
assert.doesNotMatch(html, /(?:id|name)=["'][^"']*(?:api.?key|openai.?key)[^"']*["']/i);
assert.match(app, /from ["']\.\/generator\.js["']/);
assert.match(app, /from ["']\.\/ai-proxy-client\.js["']/);
assert.match(app, /requestStoryPlan\(aiProxyUrlInput\.value, config\)/);
assert.match(app, /proxyConnectionInfo = await checkAiProxy\(aiProxyUrlInput\.value\)/);
assert.match(app, /error\?\.fallbackAllowed === false/);
assert.match(app, /source: ["']ai_proxy["']/);
assert.match(app, /source: ["']local_fallback["']/);
assert.match(app, /今回はローカルアルゴリズムで生成しました/);
assert.match(app, /autogenerate/);
assert.match(app, /form\.requestSubmit\(\)/);
assert.match(aiProxyClient, /globalThis\.crypto\?\.getRandomValues/);
assert.doesNotMatch(app, /printLayoutSelect|updatePrintLayout|dataset\.printLayout/);
assert.match(app, /getGenerationMode\(\)/);
assert.match(app, /同じseedだけでモデル出力の完全一致は保証しません/);
assert.match(app, /「この条件でつくる」を押すまで生成しません/);
assert.doesNotMatch(app, /seedRandomButton\.addEventListener\([\s\S]{0,240}form\.requestSubmit\(\)/);
assert.match(app, /document\.createElement\(["']ruby["']\)/);
assert.match(app, /questionType === ["']infer_emotion["']/);
assert.match(app, /question-sheet-meta/);
assert.match(app, /character-grid/);
assert.match(app, /response-zones/);
assert.match(app, /reading-instruction/);
assert.match(app, /つぎの　/);
assert.match(app, /あとの　もんだいに　こたえましょう/);
assert.doesNotMatch(app, /worksheet-kind|name-field|questions-heading|answer-field-label/);
assert.doesNotMatch(app, /漢字・ふりがな 小学|つぎの問いに答えましょう|一つに○|ぬき出し/);
assert.match(app, /\[\["りゆう", 2\], \["きもち", 1\]\]/);
assert.match(app, /entry\?\.render_ruby === true/);
assert.match(css, /@media print/);
assert.match(css, /@page\s*\{\s*size:\s*A4 landscape/);
assert.match(css, /data-print-layout=["']vertical["']\]\s+\.reading-instruction\s*\{[\s\S]{0,600}writing-mode:\s*vertical-rl/);
assert.match(css, /\.worksheet-title\s*\{[\s\S]{0,600}writing-mode:\s*vertical-rl/);
assert.match(css, /data-print-layout=["']vertical["'][\s\S]*writing-mode:\s*vertical-rl/);
assert.match(css, /data-print-layout=["']vertical["'][\s\S]*page-break-before:\s*always/);
assert.match(css, /\.question\s*\{[\s\S]{0,600}writing-mode:\s*vertical-rl/);
assert.match(css, /\.question::before\s*\{[\s\S]{0,500}writing-mode:\s*horizontal-tb/);
assert.match(css, /\.question::before\s*\{[\s\S]{0,500}text-combine-upright:\s*all/);
assert.match(css, /\.question-prompt\s*\{[\s\S]{0,300}text-orientation:\s*upright/);
assert.match(css, /\.questions\s*\{[\s\S]{0,500}border:\s*1px solid #aaa69e/);
assert.match(css, /data-print-layout=["']vertical["']\]\s+\.questions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 13mm/);
assert.match(css, /data-print-layout=["']vertical["']\]\s+\.question-sheet-meta\s*\{[^}]*grid-column:\s*2/);
assert.match(css, /data-print-layout=["']vertical["']\]\s+\.question-sheet-number\s*\{[^}]*bottom:\s*3mm[^}]*left:\s*3mm/);
assert.match(css, /\.question-list\s*\{[\s\S]{0,400}grid-template-columns:\s*\.85fr 1\.05fr \.9fr 1\.2fr/);
assert.match(css, /\.character-grid span\s*\{[\s\S]{0,300}width:\s*9mm[\s\S]{0,300}height:\s*9mm/);
assert.match(css, /data-print-layout=["']vertical["']\]\s+\.choice-list li\s*\{[^}]*border:\s*0/);
const answerBoxRules = [...css.matchAll(/\.answer-box\s*\{([^}]*)\}/g)].map((match) => match[1]);
const responseColumnRules = [...css.matchAll(/\.response-columns span\s*\{([^}]*)\}/g)].map((match) => match[1]);
assert.equal(answerBoxRules.length, 2, "screen and print must both style the question 3 answer area");
assert.equal(responseColumnRules.length, 2, "screen and print must both style the question 4 answer area");
assert.ok(answerBoxRules.every((rule) => !rule.includes("repeating-linear-gradient")), "question 3 must not imply a character count with cells");
assert.ok(responseColumnRules.every((rule) => !rule.includes("repeating-linear-gradient")), "question 4 must use open writing columns rather than character cells");
assert.ok(answerBoxRules.every((rule) => /border:\s*1px solid/.test(rule)), "question 3 must retain a bounded writing area");
assert.ok(responseColumnRules.every((rule) => /border:\s*1px solid/.test(rule)), "question 4 must retain bounded writing columns");
assert.match(css, /data-print-layout=["']vertical["']\]\s+\.reading-instruction\s*\{[\s\S]{0,500}writing-mode:\s*vertical-rl/);
assert.match(css, /data-print-layout=["']vertical["']\]\s+\.question\s*\{[\s\S]{0,500}padding:\s*13mm 3mm 1mm/);
assert.doesNotMatch(css, /\.worksheet-kind|\.name-field|\.questions-heading|\.answer-field-label/);
assert.match(app, /worksheet-reading-page/);
assert.doesNotMatch(app, /worksheet-meta/);
assert.doesNotMatch(css, /\.worksheet-meta/);
assert.match(app, /diagnostic-grid/);
assert.match(app, /本文構造/);
assert.match(app, /story_structure_id/);
assert.match(css, /\.control-panel\s*\{[^}]*position:\s*static[^}]*max-height:\s*none[^}]*overflow:\s*visible/);
assert.doesNotMatch(css, /\.control-panel\s*\{[^}]*overflow-y:\s*auto/);
assert.match(css, /\.generation-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
assert.match(css, /\[hidden\][\s\S]*display:\s*none\s*!important/);
assert.match(css, /\.detail-controls,[\s\S]*\.answer-panel,[\s\S]*\.evidence-panel[\s\S]*display:\s*none\s*!important/);
assert.match(css, /\.screen-only,[\s\S]*\.prototype-notice,[\s\S]*display:\s*none\s*!important/);

console.log("kokugo-no-tane UI structure test passed");
