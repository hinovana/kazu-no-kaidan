import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCandidateStore } from "../server/candidate-store.mjs";

const temporaryRoot = await mkdtemp(path.join(tmpdir(), "kokugo-no-tane-candidates-"));
try {
  const candidateId = "kt-candidate-file-test";
  const store = createCandidateStore(temporaryRoot);
  await store.save({
    candidateId,
    rawRecord: { candidate_id: candidateId, response: { id: "resp-file-test" } },
    validatedRecord: { candidate_id: candidateId, story_plan: { category: "町" } },
  });

  const rawPath = path.join(temporaryRoot, "model-candidates", "raw", `${candidateId}.json`);
  const validatedPath = path.join(temporaryRoot, "model-candidates", "validated", `${candidateId}.json`);
  const [rawText, validatedText, rawStat, validatedStat] = await Promise.all([
    readFile(rawPath, "utf8"),
    readFile(validatedPath, "utf8"),
    stat(rawPath),
    stat(validatedPath),
  ]);
  assert.equal(JSON.parse(rawText).response.id, "resp-file-test");
  assert.equal(JSON.parse(validatedText).story_plan.category, "町");
  assert.equal(rawStat.mode & 0o777, 0o600);
  assert.equal(validatedStat.mode & 0o777, 0o600);
  assert.doesNotMatch(`${rawText}${validatedText}`, /OPENAI_API_KEY|test-secret-value/u);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

console.log("kokugo-no-tane candidate store tests passed");
