import type { MachineCheck, WorksheetCheckInput } from "../types/worksheet.js";
import type {
  ChoiceQuestion,
  InferEmotionQuestion,
  Question,
} from "../types/questions.js";
import {
  getQuestionSetBlueprint,
  type QuestionBankSlot,
} from "../questions/question-set-registry.ts";

const SLOT_CONTRACTS: Readonly<Record<QuestionBankSlot, {
  readonly type: Question["type"];
  readonly patternId: string;
  readonly layoutKind: Question["answer_layout"]["kind"];
}>> = {
  trait: {
    type: "extract_explicit_trait_term",
    patternId: "QP_TRAIT_EXACT_LENGTH_EXTRACT",
    layoutKind: "fixed-character-boxes",
  },
  explicitEmotion: {
    type: "emotion_choice",
    patternId: "QP_EXPLICIT_EMOTION_CHOICE",
    layoutKind: "choice-list",
  },
  fact: {
    type: "extract_fact",
    patternId: "QP_SINGLE_FACT_EXTRACT",
    layoutKind: "single-extract",
  },
  emotionOpen: {
    type: "infer_emotion",
    patternId: "QP_EMOTION_OPEN",
    layoutKind: "reason-and-emotion",
  },
  causeResult: {
    type: "cause_result_choice",
    patternId: "QP_CAUSE_RESULT_CHOICE",
    layoutKind: "choice-list",
  },
  eventSequence: {
    type: "event_sequence_choice",
    patternId: "QP_EVENT_SEQUENCE_CHOICE",
    layoutKind: "choice-list",
  },
  sceneEmotion: {
    type: "scene_emotion_choice",
    patternId: "QP_SCENE_EMOTION_CHOICE",
    layoutKind: "choice-list",
  },
  resolution: {
    type: "extract_resolution",
    patternId: "QP_RESULT_EXTRACT",
    layoutKind: "single-extract",
  },
};

function compactText(text: unknown): string {
  return String(text).replace(/[\s　]+/gu, "");
}

function countOccurrences(text: string, target: string): number {
  if (!target) return 0;
  let count = 0;
  let position = 0;
  while ((position = text.indexOf(target, position)) !== -1) {
    count += 1;
    position += target.length;
  }
  return count;
}

function isChoiceQuestion(question: Question): question is ChoiceQuestion {
  return "choices" in question;
}

export function runQuestionSetChecks(
  worksheet: WorksheetCheckInput,
): MachineCheck[] {
  const setBlueprint = getQuestionSetBlueprint(worksheet.question_set_blueprint_id);
  const setIssues = setBlueprint.slots.flatMap((slot, index) => {
    const question = worksheet.questions[index];
    const contract = SLOT_CONTRACTS[slot];
    if (!question) return [`question ${index + 1} is missing`];
    const issues: string[] = [];
    if (question.type !== contract.type) issues.push(`question ${index + 1} type mismatch`);
    if (question.question_pattern_id !== contract.patternId) issues.push(`question ${index + 1} pattern mismatch`);
    if (question.answer_layout.kind !== contract.layoutKind) issues.push(`question ${index + 1} layout mismatch`);
    return issues;
  });
  if (worksheet.questions.length !== setBlueprint.slots.length) {
    setIssues.push(`question count must be ${setBlueprint.slots.length}`);
  }

  const choiceQuestions = worksheet.questions.filter(isChoiceQuestion);
  const choiceIssues = choiceQuestions.flatMap((question) => {
    const correct = question.choices.filter((choice) => choice.is_correct);
    return correct.length === 1 && question.correct_choice_id === correct[0]?.choice_id
      ? []
      : [question.question_id];
  });
  const choiceMeaningIssues = choiceQuestions.flatMap((question) =>
    validateChoiceMeaning(worksheet, question));
  const extractQuestions = worksheet.questions.filter((question) =>
    question.answer_layout.kind === "fixed-character-boxes"
      || question.answer_layout.kind === "single-extract");
  const extractCounts = Object.fromEntries(extractQuestions.map((question) => [
    question.question_id,
    countOccurrences(worksheet.passage.plainText, question.answer.plainText),
  ]));
  const scoringIssues = worksheet.questions.filter((question) =>
    question.scoring_elements.length === 0
      || question.scoring_elements.reduce((sum, element) => sum + element.points, 0) !== question.points);

  const emotionOpen = worksheet.questions.find((question): question is InferEmotionQuestion =>
    question.type === "infer_emotion");
  const emotionEvidencePositions = emotionOpen?.evidence_ids.map((id) =>
    worksheet.passage.sentences.findIndex((sentence) => sentence.sentence_id === id)) ?? [];
  const emotionEvidenceDistance = (emotionEvidencePositions[1] ?? -1) - (emotionEvidencePositions[0] ?? -1);
  const minimumEmotionEvidenceDistance = [1, 1, 2, 3, 5][worksheet.generation_profile - 1] ?? 1;
  const maximumEmotionEvidenceDistance = worksheet.generation_profile <= 2 ? 1 : Number.POSITIVE_INFINITY;
  const paragraphForSentence = new Map(worksheet.passage.paragraphs.flatMap((paragraph) =>
    paragraph.sentence_ids.map((id) => [id, paragraph.paragraph_id])));
  const emotionEvidenceParagraphs = emotionOpen?.evidence_ids.map((id) => paragraphForSentence.get(id)) ?? [];
  const distancePassed = emotionOpen === undefined || (
    emotionEvidenceDistance >= minimumEmotionEvidenceDistance
      && emotionEvidenceDistance <= maximumEmotionEvidenceDistance
      && (worksheet.generation_profile < 4 || emotionEvidenceParagraphs[0] !== emotionEvidenceParagraphs[1])
  );

  const openResponseMeaningIssues = validateOpenResponseMeaning(worksheet);
  const meaningIssues = [...choiceMeaningIssues, ...openResponseMeaningIssues];

  return [
    {
      check_id: "question_set_contract",
      passed: setIssues.length === 0,
      details: {
        question_set_blueprint_id: worksheet.question_set_blueprint_id,
        issues: setIssues,
        patterns: worksheet.questions.map((question) => question.question_pattern_id),
        layouts: worksheet.questions.map((question) => question.answer_layout.answer_layout_id),
      },
    },
    {
      check_id: "profile_evidence_distance",
      passed: distancePassed,
      details: {
        question_id: emotionOpen?.question_id ?? null,
        sentence_distance: emotionOpen === undefined ? null : emotionEvidenceDistance,
        minimum: minimumEmotionEvidenceDistance,
        maximum: Number.isFinite(maximumEmotionEvidenceDistance) ? maximumEmotionEvidenceDistance : null,
        paragraph_ids: emotionEvidenceParagraphs,
        skipped: emotionOpen === undefined,
      },
    },
    {
      check_id: "unique_extract_answers",
      passed: Object.values(extractCounts).every((count) => count === 1),
      details: extractCounts,
    },
    {
      check_id: "one_correct_choice",
      passed: choiceQuestions.length > 0 && choiceIssues.length === 0,
      details: { question_ids: choiceQuestions.map((question) => question.question_id), issues: choiceIssues },
    },
    {
      check_id: "template_answer_evidence_contract",
      passed: meaningIssues.length === 0,
      details: {
        issues: meaningIssues,
      },
    },
    {
      check_id: "response_scoring_elements",
      passed: scoringIssues.length === 0,
      details: { issues: scoringIssues.map((question) => question.question_id) },
    },
  ];
}

function validateChoiceMeaning(
  worksheet: WorksheetCheckInput,
  question: ChoiceQuestion,
): string[] {
  const contract = question.validation_contract;
  const evidence = question.evidence_ids.map((id) =>
    worksheet.passage.sentences.find((sentence) => sentence.sentence_id === id));
  const correctChoice = question.choices.find((choice) => choice.is_correct);
  const issues: string[] = [];
  if (!contract) return [`${question.question_id} validation contract is missing`];
  if (contract.evidence_roles.length !== evidence.length
    || evidence.some((sentence, index) => sentence?.role !== contract.evidence_roles[index])) {
    issues.push(`${question.question_id} evidence roles mismatch`);
  }
  if (contract.evidence_fragments.length !== evidence.length
    || evidence.some((sentence, index) =>
      !compactText(sentence?.plainText).includes(compactText(contract.evidence_fragments[index])))) {
    issues.push(`${question.question_id} evidence meaning mismatch`);
  }
  if (compactText(correctChoice?.plainText) !== compactText(contract.correct_choice_text)) {
    issues.push(`${question.question_id} correct choice meaning mismatch`);
  }
  return issues;
}

function validateOpenResponseMeaning(worksheet: WorksheetCheckInput): string[] {
  const q4 = worksheet.questions.find((question): question is InferEmotionQuestion =>
    question.type === "infer_emotion");
  const issues: string[] = [];
  if (!q4) issues.push("open emotion question is missing");
  if (!q4) return issues;

  const q4Contract = q4.validation_contract;
  const q4Evidence = q4.evidence_ids.map((id) =>
    worksheet.passage.sentences.find((sentence) => sentence.sentence_id === id));
  if (q4.answer_policy !== "evidence_supported_open_response") issues.push("q4 answer policy mismatch");
  if (!q4Contract || q4Evidence.some((sentence, index) => sentence?.role !== q4Contract.evidence_roles[index])) {
    issues.push("q4 evidence roles mismatch");
  }
  if (!q4Contract || q4Evidence.some((sentence, index) =>
    !compactText(sentence?.plainText).includes(compactText(q4Contract.evidence_fragments[index])))) {
    issues.push("q4 evidence meaning mismatch");
  }
  if (!q4Contract?.answer_fragments_any.some((fragment) =>
    compactText(q4.answer.plainText).includes(compactText(fragment)))) {
    issues.push("q4 model answer meaning mismatch");
  }
  return issues;
}
