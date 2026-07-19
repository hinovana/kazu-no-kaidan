import type { ScoringElement } from "../types/questions.js";

export interface RawChoiceContent {
  readonly text: string;
  readonly correct: boolean;
}

export interface ExtractPatternContent {
  readonly prompt: string;
  readonly answer: string;
  readonly acceptableAnswers: readonly string[];
  readonly evidenceRole: string;
  readonly scoringElements: readonly ScoringElement[];
  readonly disqualifyingAnswers: readonly string[];
  readonly points: number;
}

export interface ChoicePatternContent {
  readonly prompt: string;
  readonly answer: string;
  readonly acceptableAnswers: readonly string[];
  readonly choices: readonly RawChoiceContent[];
  readonly evidenceRoles: readonly string[];
  readonly evidenceFragments: readonly string[];
  readonly correctChoiceText: string;
  readonly primaryConstruct: string;
  readonly secondaryDemands: readonly string[];
  readonly requiredInferenceSteps: number;
  readonly scoringElements: readonly ScoringElement[];
  readonly disqualifyingAnswers: readonly string[];
  readonly points: number;
}

export interface EmotionOpenPatternContent extends ExtractPatternContent {
  readonly evidenceRoles: readonly string[];
  readonly evidenceFragments: readonly string[];
  readonly answerFragmentsAny: readonly string[];
}

/**
 * 物語構造固有の語句を、共通の設問パターンが利用できる形へ正規化した素材。
 */
export interface QuestionContent {
  readonly trait: ExtractPatternContent;
  readonly explicitEmotion: ChoicePatternContent;
  readonly fact: ExtractPatternContent;
  readonly emotionOpen: EmotionOpenPatternContent;
  readonly causeResult: ChoicePatternContent;
  readonly eventSequence: ChoicePatternContent;
  readonly sceneEmotion: ChoicePatternContent;
  readonly resolution: ExtractPatternContent;
}
