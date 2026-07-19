import type { SentenceId } from "./ids.js";
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

interface QuestionBase {
  readonly question_id: string;
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

export interface ExtractTraitQuestion extends QuestionBase {
  readonly type: "extract_explicit_trait_term";
}

export interface EmotionChoiceQuestion extends QuestionBase {
  readonly type: "emotion_choice";
  readonly choices: readonly Choice[];
  readonly correct_choice_id: string;
  readonly validation_contract: {
    readonly evidence_role: string;
    readonly evidence_fragment: string;
    readonly correct_choice_text: string;
  };
}

export interface ExtractFactQuestion extends QuestionBase {
  readonly type: "extract_fact";
}

export interface InferEmotionQuestion extends QuestionBase {
  readonly type: "infer_emotion";
  readonly answer_policy: "evidence_supported_open_response";
  readonly validation_contract: {
    readonly evidence_roles: readonly string[];
    readonly evidence_fragments: readonly string[];
    readonly answer_fragments_any: readonly string[];
  };
}

export type Question =
  | ExtractTraitQuestion
  | EmotionChoiceQuestion
  | ExtractFactQuestion
  | InferEmotionQuestion;
