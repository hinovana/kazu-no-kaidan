import type {
  AnswerLayoutId,
  QuestionPatternId,
  SentenceId,
} from "./ids.js";
import type { RichText } from "./text.js";

export interface ScoringElement {
  readonly element_id: string;
  readonly points: number;
  readonly description: string;
}

export interface Choice extends RichText {
  readonly choice_id: string;
  readonly is_correct: boolean;
}

export interface FixedCharacterBoxesLayout {
  readonly answer_layout_id: AnswerLayoutId;
  readonly kind: "fixed-character-boxes";
  readonly cells: number;
}

export interface SingleExtractLayout {
  readonly answer_layout_id: AnswerLayoutId;
  readonly kind: "single-extract";
}

export interface ChoiceListLayout {
  readonly answer_layout_id: AnswerLayoutId;
  readonly kind: "choice-list";
}

export interface ReasonAndEmotionLayout {
  readonly answer_layout_id: AnswerLayoutId;
  readonly kind: "reason-and-emotion";
  readonly zones: readonly [
    { readonly label: "りゆう"; readonly columns: 2 },
    { readonly label: "きもち"; readonly columns: 1 },
  ];
}

export type AnswerLayout =
  | FixedCharacterBoxesLayout
  | SingleExtractLayout
  | ChoiceListLayout
  | ReasonAndEmotionLayout;

export interface QuestionBase {
  readonly question_id: string;
  readonly question_pattern_id: QuestionPatternId;
  readonly answer_layout: AnswerLayout;
  readonly primary_construct: string;
  readonly secondary_demands: readonly string[];
  readonly prompt: RichText;
  readonly answer: RichText;
  readonly acceptable_answers: readonly string[];
  readonly evidence_ids: readonly SentenceId[];
  readonly required_inference_steps: number;
  readonly scoring_elements: readonly ScoringElement[];
  readonly disqualifying_answers: readonly string[];
  readonly points: number;
}

export interface ChoiceValidationContract {
  readonly evidence_roles: readonly string[];
  readonly evidence_fragments: readonly string[];
  readonly correct_choice_text: string;
}

interface ChoiceQuestionBase extends QuestionBase {
  readonly choices: readonly Choice[];
  readonly correct_choice_id: string;
  readonly validation_contract: ChoiceValidationContract;
}

export interface ExtractTraitQuestion extends QuestionBase {
  readonly type: "extract_explicit_trait_term";
  readonly answer_layout: FixedCharacterBoxesLayout;
}

export interface EmotionChoiceQuestion extends ChoiceQuestionBase {
  readonly type: "emotion_choice";
  readonly answer_layout: ChoiceListLayout;
}

export interface ExtractFactQuestion extends QuestionBase {
  readonly type: "extract_fact";
  readonly answer_layout: SingleExtractLayout;
}

export interface ExtractResolutionQuestion extends QuestionBase {
  readonly type: "extract_resolution";
  readonly answer_layout: SingleExtractLayout;
}

export interface InferEmotionQuestion extends QuestionBase {
  readonly type: "infer_emotion";
  readonly answer_layout: ReasonAndEmotionLayout;
  readonly answer_policy: "evidence_supported_open_response";
  readonly validation_contract: {
    readonly evidence_roles: readonly string[];
    readonly evidence_fragments: readonly string[];
    readonly answer_fragments_any: readonly string[];
  };
}

export interface CauseResultChoiceQuestion extends ChoiceQuestionBase {
  readonly type: "cause_result_choice";
  readonly answer_layout: ChoiceListLayout;
}

export interface EventSequenceChoiceQuestion extends ChoiceQuestionBase {
  readonly type: "event_sequence_choice";
  readonly answer_layout: ChoiceListLayout;
}

export interface SceneEmotionChoiceQuestion extends ChoiceQuestionBase {
  readonly type: "scene_emotion_choice";
  readonly answer_layout: ChoiceListLayout;
}

export type ChoiceQuestion =
  | EmotionChoiceQuestion
  | CauseResultChoiceQuestion
  | EventSequenceChoiceQuestion
  | SceneEmotionChoiceQuestion;

export type Question =
  | ExtractTraitQuestion
  | EmotionChoiceQuestion
  | ExtractFactQuestion
  | ExtractResolutionQuestion
  | InferEmotionQuestion
  | CauseResultChoiceQuestion
  | EventSequenceChoiceQuestion
  | SceneEmotionChoiceQuestion;
