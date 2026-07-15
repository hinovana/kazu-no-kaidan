import {
  STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
  storyClueDiscovery4qBlueprint,
} from "./story-clue-discovery-4q.js";
import {
  STORY_STANDARD_4Q_BLUEPRINT_ID,
  storyStandard4qBlueprint,
} from "./story-standard-4q.js";

export const DEFAULT_BLUEPRINT_ID = STORY_STANDARD_4Q_BLUEPRINT_ID;

const BLUEPRINTS = new Map([
  [storyStandard4qBlueprint.id, storyStandard4qBlueprint],
  [storyClueDiscovery4qBlueprint.id, storyClueDiscovery4qBlueprint],
]);

const LOCAL_BLUEPRINT_IDS = Object.freeze([
  STORY_STANDARD_4Q_BLUEPRINT_ID,
  STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
]);

function hash32(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function getBlueprint(blueprintId = DEFAULT_BLUEPRINT_ID) {
  const blueprint = BLUEPRINTS.get(blueprintId);
  if (!blueprint) throw new RangeError(`unknown blueprint_id: ${blueprintId}`);
  return blueprint;
}

export function listBlueprints() {
  return [...BLUEPRINTS.values()];
}

export function selectBlueprintId({ seed, storyPlan = null }) {
  if (storyPlan) return STORY_STANDARD_4Q_BLUEPRINT_ID;
  return LOCAL_BLUEPRINT_IDS[hash32(seed) % LOCAL_BLUEPRINT_IDS.length];
}
