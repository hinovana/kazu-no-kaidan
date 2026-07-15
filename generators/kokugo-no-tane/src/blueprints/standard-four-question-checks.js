function compactText(text) {
  return String(text).replace(/[\s　]+/gu, "");
}

function countOccurrences(text, target) {
  if (!target) return 0;
  let count = 0;
  let position = 0;
  while ((position = text.indexOf(target, position)) !== -1) {
    count += 1;
    position += target.length;
  }
  return count;
}

export function runStandardFourQuestionChecks(worksheet) {
  const expectedTypes = [
    "extract_explicit_trait_term",
    "emotion_choice",
    "extract_fact",
    "infer_emotion",
  ];
  const expectedConstructs = [
    "C1_LOCATE_EXPLICIT",
    "C2_INTERPRET_EXPLICIT_EMOTION",
    "C1_LOCATE_EXPLICIT",
    "C3_INFER_EMOTION",
  ];
  const extracts = [worksheet.questions[0], worksheet.questions[2]];
  const q2 = worksheet.questions[1];
  const q4 = worksheet.questions[3];
  const q4EvidencePositions = q4.evidence_ids.map((id) =>
    worksheet.passage.sentences.findIndex((sentence) => sentence.sentence_id === id));
  const q4EvidenceDistance = q4EvidencePositions[1] - q4EvidencePositions[0];
  const minimumQ4EvidenceDistance = [1, 1, 2, 3, 5][worksheet.generation_profile - 1];
  const maximumQ4EvidenceDistance = worksheet.generation_profile <= 2 ? 1 : Number.POSITIVE_INFINITY;
  const paragraphForSentence = new Map(worksheet.passage.paragraphs.flatMap((paragraph) =>
    paragraph.sentence_ids.map((id) => [id, paragraph.paragraph_id])));
  const q4EvidenceParagraphs = q4.evidence_ids.map((id) => paragraphForSentence.get(id));

  const q2Evidence = worksheet.passage.sentences.find((sentence) => sentence.sentence_id === q2.evidence_ids[0]);
  const q2CorrectChoice = q2.choices.find((choice) => choice.is_correct);
  const q2Contract = q2.validation_contract;
  const q2MeaningIssues = [];
  if (!q2Contract || q2Evidence?.role !== q2Contract.evidence_role) q2MeaningIssues.push("q2 evidence role mismatch");
  if (!compactText(q2Evidence?.plainText).includes(compactText(q2Contract?.evidence_fragment ?? "\u0000"))) q2MeaningIssues.push("q2 evidence meaning mismatch");
  if (compactText(q2CorrectChoice?.plainText) !== compactText(q2Contract?.correct_choice_text)) q2MeaningIssues.push("q2 correct choice meaning mismatch");

  const q4Contract = q4.validation_contract;
  const q4Evidence = q4.evidence_ids.map((id) => worksheet.passage.sentences.find((sentence) => sentence.sentence_id === id));
  const q4MeaningIssues = [];
  if (q4.answer_policy !== "evidence_supported_open_response") q4MeaningIssues.push("q4 answer policy mismatch");
  if (!q4Contract || q4Evidence.some((sentence, index) => sentence?.role !== q4Contract.evidence_roles[index])) {
    q4MeaningIssues.push("q4 evidence roles mismatch");
  }
  if (!q4Contract || q4Evidence.some((sentence, index) => !compactText(sentence?.plainText).includes(compactText(q4Contract.evidence_fragments[index])))) {
    q4MeaningIssues.push("q4 evidence meaning mismatch");
  }
  if (!q4Contract?.answer_fragments_any.some((fragment) => compactText(q4.answer.plainText).includes(compactText(fragment)))) {
    q4MeaningIssues.push("q4 model answer meaning mismatch");
  }

  return [
    {
      check_id: "standard_four_questions",
      passed: worksheet.questions.length === 4
        && worksheet.questions.every((question, index) =>
          question.type === expectedTypes[index] && question.primary_construct === expectedConstructs[index]),
      details: { blueprint_id: worksheet.blueprint_id, types: worksheet.questions.map((question) => question.type) },
    },
    {
      check_id: "profile_evidence_distance",
      passed: q4EvidenceDistance >= minimumQ4EvidenceDistance
        && q4EvidenceDistance <= maximumQ4EvidenceDistance
        && (worksheet.generation_profile < 4 || q4EvidenceParagraphs[0] !== q4EvidenceParagraphs[1]),
      details: {
        question_id: "q4",
        sentence_distance: q4EvidenceDistance,
        minimum: minimumQ4EvidenceDistance,
        maximum: Number.isFinite(maximumQ4EvidenceDistance) ? maximumQ4EvidenceDistance : null,
        paragraph_ids: q4EvidenceParagraphs,
      },
    },
    {
      check_id: "unique_extract_answers",
      passed: extracts.every((question) => countOccurrences(worksheet.passage.plainText, question.answer.plainText) === 1),
      details: Object.fromEntries(extracts.map((question) => [question.question_id, countOccurrences(worksheet.passage.plainText, question.answer.plainText)])),
    },
    {
      check_id: "one_correct_choice",
      passed: q2.choices.length === 3 && q2.choices.filter((choice) => choice.is_correct).length === 1
        && q2.correct_choice_id === q2.choices.find((choice) => choice.is_correct)?.choice_id,
      details: { correct_choice_id: q2.correct_choice_id },
    },
    {
      check_id: "template_answer_evidence_contract",
      passed: q2MeaningIssues.length === 0 && q4MeaningIssues.length === 0,
      details: { issues: [...q2MeaningIssues, ...q4MeaningIssues] },
    },
    {
      check_id: "response_scoring_elements",
      passed: q4.scoring_elements.length >= 2
        && q4.scoring_elements.reduce((sum, element) => sum + element.points, 0) === 2,
      details: { elements: q4.scoring_elements.map((element) => element.element_id) },
    },
  ];
}
