import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  decodeReferenceCorpusJson,
  referenceProblemToPuzzle,
} from "../application/decode-reference-corpus.ts";

const exampleUrl = new URL(
  "../reference/example-source-corpus.json",
  import.meta.url,
);
const exampleText = await readFile(exampleUrl, "utf8");
const decoded = decodeReferenceCorpusJson(exampleText);
assert.equal(decoded.ok, true);
if (!decoded.ok) {
  throw new Error(decoded.errors.join("\n"));
}

assert.equal(decoded.corpus.schemaVersion, "onaji-no-tsunagi.source-corpus.v1");
assert.equal(decoded.corpus.coordinateSystem.origin, "top-left");
assert.equal(decoded.corpus.coordinateSystem.indexBase, 0);
assert.equal(decoded.corpus.problems.length, 1);
assert.deepEqual(referenceProblemToPuzzle(decoded.corpus.problems[0]), {
  schemaVersion: "onaji-no-tsunagi.puzzle.v1",
  puzzleId: "synthetic-example-1",
  width: 5,
  height: 5,
  terminals: decoded.corpus.problems[0].terminals,
});

const parsedExample = JSON.parse(exampleText);

const unknownKey = structuredClone(parsedExample);
unknownKey.problems[0].board.wdith = 5;
const unknownKeyResult = decodeReferenceCorpusJson(
  JSON.stringify(unknownKey),
);
assert.equal(unknownKeyResult.ok, false);
assert.ok(unknownKeyResult.errors.some((error) => (
  error.includes("$.problems[0].board.wdith")
  && error.includes("未定義")
)));

const overlap = structuredClone(parsedExample);
overlap.problems[0].terminals[1].row = 0;
overlap.problems[0].terminals[1].column = 0;
const overlapResult = decodeReferenceCorpusJson(JSON.stringify(overlap));
assert.equal(overlapResult.ok, false);
assert.ok(overlapResult.errors.some((error) => error.includes("同じマス")));

const outside = structuredClone(parsedExample);
outside.problems[0].terminals[0].row = 5;
const outsideResult = decodeReferenceCorpusJson(JSON.stringify(outside));
assert.equal(outsideResult.ok, false);
assert.ok(outsideResult.errors.some((error) => error.includes("盤面外")));

const duplicateProblem = structuredClone(parsedExample);
duplicateProblem.problems.push(structuredClone(duplicateProblem.problems[0]));
const duplicateResult = decodeReferenceCorpusJson(
  JSON.stringify(duplicateProblem),
);
assert.equal(duplicateResult.ok, false);
assert.ok(duplicateResult.errors.some((error) => (
  error.includes("問題IDが重複")
)));
assert.ok(duplicateResult.errors.some((error) => (
  error.includes("同じ出典位置")
)));

const verified = structuredClone(parsedExample);
verified.sourceDocument.sha256 = "a".repeat(64);
verified.problems[0].transcription.status = "double-checked";
verified.problems[0].transcription.checkedAgainstSourceSha256 = "a".repeat(64);
assert.equal(
  decodeReferenceCorpusJson(JSON.stringify(verified)).ok,
  true,
);

const differentSource = structuredClone(verified);
differentSource.problems[0].transcription.checkedAgainstSourceSha256 = "b".repeat(64);
const differentSourceResult = decodeReferenceCorpusJson(
  JSON.stringify(differentSource),
);
assert.equal(differentSourceResult.ok, false);
assert.ok(differentSourceResult.errors.some((error) => (
  error.includes("原本PDFのSHA-256と一致しません")
)));

const wrongPdfPage = structuredClone(parsedExample);
wrongPdfPage.problems[0].source.pdfPage = 2;
const wrongPdfPageResult = decodeReferenceCorpusJson(
  JSON.stringify(wrongPdfPage),
);
assert.equal(wrongPdfPageResult.ok, false);
assert.ok(wrongPdfPageResult.errors.some((error) => (
  error.includes("PDFページ数を超えています")
)));

const syntaxResult = decodeReferenceCorpusJson("{");
assert.equal(syntaxResult.ok, false);
assert.match(syntaxResult.errors[0], /JSONとして読み込めません/u);

const schema = JSON.parse(await readFile(
  new URL("../reference/source-corpus.schema.json", import.meta.url),
  "utf8",
));
assert.equal(
  schema.properties.schemaVersion.const,
  "onaji-no-tsunagi.source-corpus.v1",
);
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.sourceDocument.properties.pdfPageCount.minimum, 1);

console.log("onaji-no-tsunagi reference corpus decoder tests passed");
