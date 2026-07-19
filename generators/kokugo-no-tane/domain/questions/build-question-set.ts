import type { TemplateRenderer } from "../language/template-renderer.js";
import type {
  AnswerLayout,
  Choice,
  Question,
  QuestionBase,
} from "../types/questions.js";
import type {
  AnswerLayoutId,
  QuestionPatternId,
  QuestionSetBlueprintId,
  SentenceId,
} from "../types/ids.js";
import type {
  ChoicePatternContent,
  ExtractPatternContent,
  QuestionContent,
  RawChoiceContent,
} from "./question-content.js";
import {
  QP_CAUSE_RESULT_CHOICE,
  QP_EVENT_SEQUENCE_CHOICE,
  QP_EMOTION_OPEN,
  QP_EXPLICIT_EMOTION_CHOICE,
  QP_RESULT_EXTRACT,
  QP_SCENE_EMOTION_CHOICE,
  QP_SINGLE_FACT_EXTRACT,
  QP_TRAIT_EXACT_LENGTH_EXTRACT,
  getQuestionSetBlueprint,
  type QuestionBankSlot,
} from "./question-set-registry.ts";

const AL_FIXED_CHAR_BOXES = "AL_FIXED_CHAR_BOXES" as AnswerLayoutId;
const AL_SINGLE_EXTRACT = "AL_SINGLE_EXTRACT" as AnswerLayoutId;
const AL_CHOICE_LIST = "AL_CHOICE_LIST" as AnswerLayoutId;
const AL_REASON_AND_EMOTION = "AL_REASON_AND_EMOTION" as AnswerLayoutId;

interface RawQuestion extends Omit<QuestionBase, "prompt" | "answer"> {
  readonly type: Question["type"];
  readonly prompt: string;
  readonly answer: string;
  readonly rawChoices?: readonly RawChoiceContent[];
  readonly answer_policy?: "evidence_supported_open_response";
  readonly validation_contract?: unknown;
}

export function buildQuestionSet(input: {
  readonly questionSetBlueprintId: QuestionSetBlueprintId;
  readonly content: QuestionContent;
  readonly render: TemplateRenderer;
  readonly evidence: Readonly<Record<string, SentenceId>>;
  readonly random: () => number;
}): readonly Question[] {
  const definition = getQuestionSetBlueprint(input.questionSetBlueprintId);
  return definition.slots.map((slot, index) => buildQuestion({
    ...input,
    slot,
    questionId: `q${index + 1}`,
  }));
}

function buildQuestion(input: {
  readonly slot: QuestionBankSlot;
  readonly questionId: string;
  readonly content: QuestionContent;
  readonly render: TemplateRenderer;
  readonly evidence: Readonly<Record<string, SentenceId>>;
  readonly random: () => number;
}): Question {
  const raw = rawQuestionForSlot(input.slot, input.content, input.evidence);
  const { rawChoices, ...questionFields } = raw;
  const scope = `question_${input.questionId}`;
  const choices = rawChoices === undefined
    ? undefined
    : shuffled(input.random, rawChoices).map((choice, index): Choice => ({
      choice_id: String.fromCharCode(97 + index),
      ...input.render(choice.text, scope, `${input.questionId}_choice_${index + 1}`),
      is_correct: choice.correct,
    }));
  const prompt = input.render(raw.prompt, scope, `${input.questionId}_prompt`);
  const answer = input.render(raw.answer, `answer_${input.questionId}`, `${input.questionId}_answer`);
  const base = {
    ...questionFields,
    question_id: input.questionId,
    prompt,
    answer,
  };
  return choices === undefined
    ? base as Question
    : {
      ...base,
      choices,
      correct_choice_id: choices.find((choice) => choice.is_correct)?.choice_id,
    } as Question;
}

function rawQuestionForSlot(
  slot: QuestionBankSlot,
  content: QuestionContent,
  evidence: Readonly<Record<string, SentenceId>>,
): RawQuestion {
  switch (slot) {
    case "trait":
      return extractQuestion({
        type: "extract_explicit_trait_term",
        patternId: QP_TRAIT_EXACT_LENGTH_EXTRACT,
        layout: {
          answer_layout_id: AL_FIXED_CHAR_BOXES,
          kind: "fixed-character-boxes",
          cells: Array.from(content.trait.answer.replaceAll("|", "")).length,
        },
        primaryConstruct: "C1_LOCATE_EXPLICIT",
        secondaryDemands: ["指定字数の抜き出し"],
        content: content.trait,
        evidence,
      });
    case "explicitEmotion":
      return choiceQuestion({
        type: "emotion_choice",
        patternId: QP_EXPLICIT_EMOTION_CHOICE,
        layout: { answer_layout_id: AL_CHOICE_LIST, kind: "choice-list" },
        content: content.explicitEmotion,
        evidence,
      });
    case "fact":
      return extractQuestion({
        type: "extract_fact",
        patternId: QP_SINGLE_FACT_EXTRACT,
        layout: { answer_layout_id: AL_SINGLE_EXTRACT, kind: "single-extract" },
        primaryConstruct: "C1_LOCATE_EXPLICIT",
        secondaryDemands: ["明示情報の探索"],
        content: content.fact,
        evidence,
      });
    case "emotionOpen":
      return {
        ...extractQuestion({
          type: "infer_emotion",
          patternId: QP_EMOTION_OPEN,
          layout: {
            answer_layout_id: AL_REASON_AND_EMOTION,
            kind: "reason-and-emotion",
            zones: [
              { label: "りゆう", columns: 2 },
              { label: "きもち", columns: 1 },
            ],
          },
          primaryConstruct: "C3_INFER_EMOTION",
          secondaryDemands: ["C5_COMPOSE_WITH_EVIDENCE"],
          content: content.emotionOpen,
          evidence,
          evidenceRoles: content.emotionOpen.evidenceRoles,
        }),
        answer_policy: "evidence_supported_open_response",
        validation_contract: {
          evidence_roles: content.emotionOpen.evidenceRoles,
          evidence_fragments: content.emotionOpen.evidenceFragments,
          answer_fragments_any: content.emotionOpen.answerFragmentsAny,
        },
      };
    case "causeResult":
      return choiceQuestion({
        type: "cause_result_choice",
        patternId: QP_CAUSE_RESULT_CHOICE,
        layout: { answer_layout_id: AL_CHOICE_LIST, kind: "choice-list" },
        content: content.causeResult,
        evidence,
      });
    case "eventSequence":
      return choiceQuestion({
        type: "event_sequence_choice",
        patternId: QP_EVENT_SEQUENCE_CHOICE,
        layout: { answer_layout_id: AL_CHOICE_LIST, kind: "choice-list" },
        content: content.eventSequence,
        evidence,
      });
    case "sceneEmotion":
      return choiceQuestion({
        type: "scene_emotion_choice",
        patternId: QP_SCENE_EMOTION_CHOICE,
        layout: { answer_layout_id: AL_CHOICE_LIST, kind: "choice-list" },
        content: content.sceneEmotion,
        evidence,
      });
    case "resolution":
      return extractQuestion({
        type: "extract_resolution",
        patternId: QP_RESULT_EXTRACT,
        layout: { answer_layout_id: AL_SINGLE_EXTRACT, kind: "single-extract" },
        primaryConstruct: "C1_LOCATE_EXPLICIT",
        secondaryDemands: ["結果の明示情報探索"],
        content: content.resolution,
        evidence,
      });
    default:
      return assertNever(slot);
  }
}

function extractQuestion(input: {
  readonly type: "extract_explicit_trait_term" | "extract_fact" | "extract_resolution" | "infer_emotion";
  readonly patternId: QuestionPatternId;
  readonly layout: AnswerLayout;
  readonly primaryConstruct: string;
  readonly secondaryDemands: readonly string[];
  readonly content: ExtractPatternContent;
  readonly evidence: Readonly<Record<string, SentenceId>>;
  readonly evidenceRoles?: readonly string[];
}): RawQuestion {
  const evidenceRoles = input.evidenceRoles ?? [input.content.evidenceRole];
  return {
    question_id: "pending",
    question_pattern_id: input.patternId,
    answer_layout: input.layout,
    type: input.type,
    primary_construct: input.primaryConstruct,
    secondary_demands: input.secondaryDemands,
    prompt: input.content.prompt,
    answer: input.content.answer,
    acceptable_answers: input.content.acceptableAnswers,
    evidence_ids: evidenceRoles.map((role) => requireEvidence(input.evidence, role)),
    required_inference_steps: input.type === "infer_emotion" ? 1 : 0,
    scoring_elements: input.content.scoringElements,
    disqualifying_answers: input.content.disqualifyingAnswers,
    points: input.content.points,
  };
}

function choiceQuestion(input: {
  readonly type: "emotion_choice" | "cause_result_choice" | "event_sequence_choice" | "scene_emotion_choice";
  readonly patternId: QuestionPatternId;
  readonly layout: AnswerLayout;
  readonly content: ChoicePatternContent;
  readonly evidence: Readonly<Record<string, SentenceId>>;
}): RawQuestion {
  const question: RawQuestion = {
    question_id: "pending",
    question_pattern_id: input.patternId,
    answer_layout: input.layout,
    type: input.type,
    primary_construct: input.content.primaryConstruct,
    secondary_demands: input.content.secondaryDemands,
    prompt: input.content.prompt,
    answer: input.content.answer,
    acceptable_answers: input.content.acceptableAnswers,
    evidence_ids: input.content.evidenceRoles.map((role) => requireEvidence(input.evidence, role)),
    required_inference_steps: input.content.requiredInferenceSteps,
    scoring_elements: input.content.scoringElements,
    disqualifying_answers: input.content.disqualifyingAnswers,
    points: input.content.points,
    rawChoices: input.content.choices,
    validation_contract: {
      evidence_roles: input.content.evidenceRoles,
      evidence_fragments: input.content.evidenceFragments,
      correct_choice_text: input.content.correctChoiceText,
    },
  };
  return question;
}

function requireEvidence(
  evidence: Readonly<Record<string, SentenceId>>,
  role: string,
): SentenceId {
  const sentenceId = evidence[role];
  if (sentenceId === undefined) throw new Error(`evidence role is missing: ${role}`);
  return sentenceId;
}

function shuffled<T>(random: () => number, values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const currentValue = result[index];
    const otherValue = result[other];
    if (currentValue === undefined || otherValue === undefined) continue;
    result[index] = otherValue;
    result[other] = currentValue;
  }
  return result;
}

function assertNever(value: never): never {
  throw new TypeError(`unsupported question bank slot: ${String(value)}`);
}
