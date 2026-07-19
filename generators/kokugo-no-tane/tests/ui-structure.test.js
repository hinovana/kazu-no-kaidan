import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const generatorBase = new URL("../", import.meta.url);
const rootBase = new URL("../../../", import.meta.url);
const [legacyHtml, redirect, rootHtml, css, page, moduleSource, registry, aiProxyClient] = await Promise.all([
  readFile(new URL("index.html", generatorBase), "utf8"),
  readFile(new URL("redirect.ts", generatorBase), "utf8"),
  readFile(new URL("index.html", rootBase), "utf8"),
  readFile(new URL("styles.css", generatorBase), "utf8"),
  readFile(new URL("ui/KokugoNoTanePage.tsx", generatorBase), "utf8"),
  readFile(new URL("module.tsx", generatorBase), "utf8"),
  readFile(new URL("src/app/generator-registry.ts", rootBase), "utf8"),
  readFile(new URL("infrastructure/ai/ai-proxy-client.ts", generatorBase), "utf8"),
]);

assert.match(rootHtml, /id=["']root["']/);
assert.match(rootHtml, /src=["']\/src\/app\/main\.tsx["']/);
assert.match(legacyHtml, /#\/generators\/kokugo-no-tane/);
assert.match(legacyHtml, /src=["']\.\/redirect\.ts["']/);
assert.doesNotMatch(legacyHtml, /src\/app\.js/);
assert.match(redirect, /\/generators\/kokugo-no-tane/);
assert.match(redirect, /window\.location\.search/);
assert.match(redirect, /window\.location\.replace\(spaUrl\)/);
assert.match(registry, /kind:\s*["']react["']/);
assert.match(registry, /load:\s*async\s*\(\)\s*=>[\s\S]*import\(["']\.\.\/\.\.\/generators\/kokugo-no-tane\/module\.tsx["']\)[\s\S]*\.default/);
assert.match(moduleSource, /satisfies LoadedGeneratorModule/);
assert.match(moduleSource, /ui\/KokugoNoTanePage\.js/);

for (const text of [
  "生成条件プロファイル",
  "実測した難易度ではありません",
  "構造的自動検査通過・人間未確認",
  "開発確認用プロトタイプ／児童利用・学力判定不可",
  "語彙・文法の学年適合性は未検証",
  "ランダムseed",
  "以下の条件は、どちらの生成方式でも使います",
  "http://127.0.0.1:8787",
  "APIキーはここへ入力しません",
  "同じseedだけでモデル出力の完全一致は保証しません",
  "「この条件でつくる」を押すまで生成しません",
  "worksheet-reading-page",
  "question-sheet-meta",
  "character-grid",
  "response-zones",
  "reading-instruction",
  "つぎの　",
  "あとの　もんだいに　こたえましょう",
  "diagnostic-grid",
  "本文構造",
]) {
  assert.match(page, new RegExp(text), `React UI must contain: ${text}`);
}

for (const topic of ["auto", "school", "home", "nature", "town", "animal"]) {
  assert.match(page, new RegExp(`["']${topic}["']`), `topic option ${topic} must be present`);
}
for (const length of ["short", "standard", "long"]) {
  assert.match(page, new RegExp(`["']${length}["']`), `length option ${length} must be present`);
}

assert.doesNotMatch(page, /(?:id|name)=["'][^"']*(?:api.?key|openai.?key)[^"']*["']/i);
assert.match(page, /from ["']\.\.\/application\/generate-worksheet-use-case\.ts["']/);
assert.match(page, /from ["']\.\.\/infrastructure\/ai\/ai-proxy-client\.ts["']/);
assert.match(page, /requestStoryPlan\(aiProxyUrl, normalizedConfig\)/);
assert.match(page, /checkAiProxy\(aiProxyUrl\)/);
assert.match(page, /source:\s*["']story-plan\.v1["']/);
assert.match(page, /source:\s*["']local-fallback["']/);
assert.match(page, /今回はローカルアルゴリズムで生成しました/);
assert.match(page, /autogenerate/);
assert.match(page, /document\.documentElement\.dataset\.printLayout\s*=\s*["']vertical["']/);
assert.match(page, /question\.type === ["']infer_emotion["']|<ResponseZones/);
assert.match(page, /\[\s*\["りゆう", 2\], \["きもち", 1\]\s*\]/);
assert.match(page, /entry\.render_ruby/);
assert.match(page, /story_structure_id/);
assert.doesNotMatch(page, /worksheet-kind|name-field|questions-heading|answer-field-label|worksheet-meta/);
assert.match(aiProxyClient, /globalThis\.crypto\?\.getRandomValues/);

assert.match(css, /@media print/);
assert.match(css, /@page\s*\{\s*size:\s*A4 landscape/);
assert.match(css, /data-print-layout=["']vertical["']\]\s+\.reading-instruction\s*\{[\s\S]{0,600}writing-mode:\s*vertical-rl/);
assert.match(css, /\.worksheet-title\s*\{[\s\S]{0,600}writing-mode:\s*vertical-rl/);
assert.match(css, /data-print-layout=["']vertical["'][\s\S]*page-break-before:\s*always/);
assert.match(css, /\.question::before\s*\{[\s\S]{0,500}writing-mode:\s*horizontal-tb/);
assert.match(css, /\.question::before\s*\{[\s\S]{0,500}text-combine-upright:\s*all/);
assert.match(css, /\.question-prompt\s*\{[\s\S]{0,300}text-orientation:\s*upright/);
assert.match(css, /data-print-layout=["']vertical["']\]\s+\.questions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 13mm/);
assert.match(css, /data-print-layout=["']vertical["']\]\s+\.question-sheet-meta\s*\{[^}]*grid-column:\s*2/);
assert.match(css, /\.question-list\s*\{[\s\S]{0,400}grid-template-columns:\s*\.85fr 1\.05fr \.9fr 1\.2fr/);
assert.match(css, /\.character-grid span\s*\{[\s\S]{0,300}width:\s*9mm[\s\S]{0,300}height:\s*9mm/);

const answerBoxRules = [...css.matchAll(/\.answer-box\s*\{([^}]*)\}/g)].map((match) => match[1]);
const responseColumnRules = [...css.matchAll(/\.response-columns span\s*\{([^}]*)\}/g)].map((match) => match[1]);
assert.equal(answerBoxRules.length, 2, "screen and print must both style the question 3 answer area");
assert.equal(responseColumnRules.length, 2, "screen and print must both style the question 4 answer area");
assert.ok(answerBoxRules.every((rule) => !rule.includes("repeating-linear-gradient")));
assert.ok(responseColumnRules.every((rule) => !rule.includes("repeating-linear-gradient")));
assert.ok(answerBoxRules.every((rule) => /border:\s*1px solid/.test(rule)));
assert.ok(responseColumnRules.every((rule) => /border:\s*1px solid/.test(rule)));
assert.match(css, /\.control-panel\s*\{[^}]*position:\s*static[^}]*max-height:\s*none[^}]*overflow:\s*visible/);
assert.doesNotMatch(css, /\.control-panel\s*\{[^}]*overflow-y:\s*auto/);
assert.match(css, /\.generation-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
assert.match(css, /\.screen-only,[\s\S]*\.prototype-notice,[\s\S]*display:\s*none\s*!important/);

console.log("kokugo-no-tane React UI structure test passed");
