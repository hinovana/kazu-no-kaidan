import assert from "node:assert/strict";
import {
  DEFAULT_BLUEPRINT_ID,
  getBlueprint,
  listBlueprints,
  selectBlueprintId,
} from "../domain/blueprints/registry.ts";
import {
  STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
  STORY_CLUE_DISCOVERY_STRUCTURE_ID,
} from "../domain/blueprints/story-clue-discovery/blueprint.ts";
import {
  STORY_RETRY_CRAFT_STRUCTURE_ID,
  STORY_STANDARD_4Q_BLUEPRINT_ID,
} from "../domain/blueprints/story-retry-craft/blueprint.ts";
import { generateWorksheet, runMachineChecks } from "../domain/generation/generate-worksheet.ts";
import { createStoryPlanFixture } from "./fixtures/story-plan-fixture.js";

assert.equal(DEFAULT_BLUEPRINT_ID, STORY_STANDARD_4Q_BLUEPRINT_ID);
assert.deepEqual(listBlueprints().map((blueprint) => blueprint.id), [
  STORY_STANDARD_4Q_BLUEPRINT_ID,
  STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
]);

const blueprint = getBlueprint();
assert.equal(blueprint.id, STORY_STANDARD_4Q_BLUEPRINT_ID);
assert.equal(blueprint.storyStructureId, STORY_RETRY_CRAFT_STRUCTURE_ID);
assert.equal(Object.isFrozen(blueprint), true);
for (const registeredBlueprint of listBlueprints()) {
  assert.equal(Object.isFrozen(registeredBlueprint), true);
  for (const method of [
    "createScenario",
    "pickTrait",
    "buildTitle",
    "buildStorySentences",
    "buildQuestions",
    "buildStoryMetadata",
    "templateVersion",
    "runMachineChecks",
  ]) {
    assert.equal(typeof registeredBlueprint[method], "function", `${registeredBlueprint.id}.${method} must be part of the blueprint contract`);
  }
}

const options = {
  grade: 1,
  profile: 3,
  length: "standard",
  seed: "blueprint-registry",
  topic: "school",
};
const automaticallySelectedId = selectBlueprintId({ seed: "string:blueprint-registry" });
const byAutomaticSelection = generateWorksheet(options);
const byExplicitSelection = generateWorksheet({ ...options, blueprintId: automaticallySelectedId });
assert.deepEqual(byExplicitSelection, byAutomaticSelection);
assert.equal(byAutomaticSelection.blueprint_id, automaticallySelectedId);
assert.equal(byAutomaticSelection.machine_checks.checks.find((check) => check.check_id === "blueprint_contract").passed, true);

const expectedStructures = new Map([
  [STORY_STANDARD_4Q_BLUEPRINT_ID, STORY_RETRY_CRAFT_STRUCTURE_ID],
  [STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID, STORY_CLUE_DISCOVERY_STRUCTURE_ID],
]);
for (const [blueprintId, structureId] of expectedStructures) {
  const worksheet = generateWorksheet({ ...options, blueprintId });
  assert.equal(worksheet.blueprint_id, blueprintId);
  assert.equal(worksheet.story_structure_id, structureId);
  assert.equal(worksheet.generation_provenance.blueprint_id, blueprintId);
  assert.equal(worksheet.generation_provenance.story_structure_id, structureId);
  assert.equal(worksheet.machine_checks.checks.find((check) => check.check_id === "blueprint_contract").passed, true);
}

assert.equal(selectBlueprintId({ seed: "string:variation-0" }), STORY_STANDARD_4Q_BLUEPRINT_ID);
assert.equal(selectBlueprintId({ seed: "string:variation-1" }), STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID);
assert.equal(selectBlueprintId({ seed: "any", storyPlan: {} }), STORY_STANDARD_4Q_BLUEPRINT_ID);

const tampered = structuredClone(byAutomaticSelection);
tampered.story_structure_id = "unknown-structure.v1";
const tamperedChecks = runMachineChecks(tampered);
assert.equal(tamperedChecks.all_passed, false);
assert.equal(tamperedChecks.checks.find((check) => check.check_id === "blueprint_contract").passed, false);

assert.throws(
  () => getBlueprint("missing-blueprint.v1"),
  (error) => error instanceof RangeError && /unknown blueprint_id/u.test(error.message),
);
assert.throws(
  () => generateWorksheet({ ...options, blueprintId: "missing-blueprint.v1" }),
  (error) => error instanceof RangeError && /unknown blueprint_id/u.test(error.message),
);

assert.throws(
  () => generateWorksheet({
    ...options,
    topic: "town",
    blueprintId: STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
    storyPlan: createStoryPlanFixture(),
  }),
  /does not accept story-plan\.v1/iu,
);

console.log("kokugo-no-tane blueprint registry tests passed");
