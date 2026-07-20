import {
  STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
  storyClueDiscovery4qBlueprint,
} from "./story-clue-discovery/blueprint.ts";
import {
  STORY_STANDARD_4Q_BLUEPRINT_ID,
  storyStandard4qBlueprint,
} from "./story-retry-craft/blueprint.ts";
import {
  STORY_LATE_ARRIVAL_4Q_BLUEPRINT_ID,
  storyLateArrival4qBlueprint,
} from "./story-late-arrival/blueprint.ts";
import { hash32 } from "../generation/random.ts";
import type { Blueprint, BlueprintTrait, ResolvedBlueprint } from "./blueprint.js";
import type { BlueprintId } from "../types/ids.js";
import type { StoryPlanV1 } from "../types/story-plan.js";

export const DEFAULT_BLUEPRINT_ID = STORY_STANDARD_4Q_BLUEPRINT_ID;

const BLUEPRINTS = new Map<BlueprintId, ResolvedBlueprint>([
  [storyStandard4qBlueprint.id, eraseBlueprint(storyStandard4qBlueprint)],
  [storyClueDiscovery4qBlueprint.id, eraseBlueprint(storyClueDiscovery4qBlueprint)],
  [storyLateArrival4qBlueprint.id, eraseBlueprint(storyLateArrival4qBlueprint)],
]);

const LOCAL_BLUEPRINT_IDS = Object.freeze([
  STORY_STANDARD_4Q_BLUEPRINT_ID,
  STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
  STORY_LATE_ARRIVAL_4Q_BLUEPRINT_ID,
]);

export function getBlueprint(blueprintId: string = DEFAULT_BLUEPRINT_ID): ResolvedBlueprint {
  const blueprint = BLUEPRINTS.get(blueprintId as BlueprintId);
  if (!blueprint) throw new RangeError(`unknown blueprint_id: ${blueprintId}`);
  return blueprint;
}

function eraseBlueprint<TScenario, TTrait extends BlueprintTrait>(
  blueprint: Blueprint<TScenario, TTrait>,
): ResolvedBlueprint {
  // The registry is heterogeneous. The common engine treats scenario and trait
  // values as opaque and always returns them to the same blueprint instance.
  return blueprint as unknown as ResolvedBlueprint;
}

export function listBlueprints(): readonly ResolvedBlueprint[] {
  return [...BLUEPRINTS.values()];
}

export function selectBlueprintId({
  seed,
  storyPlan = null,
}: {
  readonly seed: string;
  readonly storyPlan?: StoryPlanV1 | null;
}): BlueprintId {
  if (storyPlan) return STORY_STANDARD_4Q_BLUEPRINT_ID;
  const selected = LOCAL_BLUEPRINT_IDS[hash32(seed) % LOCAL_BLUEPRINT_IDS.length];
  if (selected === undefined) throw new Error("local blueprint registry is empty");
  return selected;
}
