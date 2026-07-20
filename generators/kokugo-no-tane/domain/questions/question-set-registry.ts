import { hash32 } from "../generation/random.ts";
import type {
  QuestionPatternId,
  QuestionSetBlueprintId,
} from "../types/ids.js";

export type QuestionBankSlot =
  | "trait"
  | "explicitEmotion"
  | "fact"
  | "emotionOpen"
  | "causeResult"
  | "eventSequence"
  | "sceneEmotion"
  | "resolution";

export interface QuestionSetBlueprint {
  readonly id: QuestionSetBlueprintId;
  readonly label: string;
  readonly slots: readonly QuestionBankSlot[];
}

export const STANDARD_READING_4Q_ID = "standard-reading-4q.v1" as QuestionSetBlueprintId;
export const CAUSAL_TRACE_6Q_ID = "causal-trace-6q.v1" as QuestionSetBlueprintId;
export const CONTEXT_AND_INFERENCE_4Q_ID = "context-and-inference-4q.v1" as QuestionSetBlueprintId;

export const QP_TRAIT_EXACT_LENGTH_EXTRACT = "QP_TRAIT_EXACT_LENGTH_EXTRACT" as QuestionPatternId;
export const QP_EXPLICIT_EMOTION_CHOICE = "QP_EXPLICIT_EMOTION_CHOICE" as QuestionPatternId;
export const QP_SINGLE_FACT_EXTRACT = "QP_SINGLE_FACT_EXTRACT" as QuestionPatternId;
export const QP_EMOTION_OPEN = "QP_EMOTION_OPEN" as QuestionPatternId;
export const QP_CAUSE_RESULT_CHOICE = "QP_CAUSE_RESULT_CHOICE" as QuestionPatternId;
export const QP_EVENT_SEQUENCE_CHOICE = "QP_EVENT_SEQUENCE_CHOICE" as QuestionPatternId;
export const QP_SCENE_EMOTION_CHOICE = "QP_SCENE_EMOTION_CHOICE" as QuestionPatternId;
export const QP_RESULT_EXTRACT = "QP_RESULT_EXTRACT" as QuestionPatternId;

const QUESTION_SET_BLUEPRINTS: readonly QuestionSetBlueprint[] = Object.freeze([
  Object.freeze({
    id: STANDARD_READING_4Q_ID,
    label: "標準読解4問",
    slots: Object.freeze<QuestionBankSlot[]>(["trait", "explicitEmotion", "fact", "emotionOpen"]),
  }),
  Object.freeze({
    id: CAUSAL_TRACE_6Q_ID,
    label: "できごとをたどる6問",
    slots: Object.freeze<QuestionBankSlot[]>([
      "causeResult",
      "explicitEmotion",
      "fact",
      "eventSequence",
      "emotionOpen",
      "resolution",
    ]),
  }),
  Object.freeze({
    id: CONTEXT_AND_INFERENCE_4Q_ID,
    label: "文脈と気持ちを考える4問",
    slots: Object.freeze<QuestionBankSlot[]>(["sceneEmotion", "resolution", "eventSequence", "emotionOpen"]),
  }),
]);

const QUESTION_SET_BY_ID = new Map(
  QUESTION_SET_BLUEPRINTS.map((blueprint) => [blueprint.id, blueprint] as const),
);

export function listQuestionSetBlueprints(): readonly QuestionSetBlueprint[] {
  return QUESTION_SET_BLUEPRINTS;
}

export function getQuestionSetBlueprint(id: QuestionSetBlueprintId): QuestionSetBlueprint {
  const blueprint = QUESTION_SET_BY_ID.get(id);
  if (!blueprint) throw new RangeError(`unknown question_set_blueprint_id: ${id}`);
  return blueprint;
}

export function selectQuestionSetBlueprintId(input: {
  readonly seed: string;
  readonly storyStructureId: string;
}): QuestionSetBlueprintId {
  const index = hash32(`question-set|${input.storyStructureId}|${input.seed}`)
    % QUESTION_SET_BLUEPRINTS.length;
  return QUESTION_SET_BLUEPRINTS[index]!.id;
}
