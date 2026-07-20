import type { GenerationProfile } from "../types/generation.js";
import type { RichTextSegment } from "../types/text.js";
import type { StoryParagraph, StorySentence } from "../types/worksheet.js";
import { plainFromSegments } from "../language/template-renderer.ts";

export function buildParagraphs(
  sentences: readonly StorySentence[],
  profile: GenerationProfile,
): StoryParagraph[] {
  const paragraphCount = Math.min(
    12,
    Math.max(5, profile + 4, Math.ceil(sentences.length / 3)),
  );
  const paragraphSize = Math.ceil(sentences.length / paragraphCount);
  const paragraphs: StoryParagraph[] = [];

  for (let index = 0; index < paragraphCount; index += 1) {
    const paragraphSentences = sentences.slice(
      index * paragraphSize,
      (index + 1) * paragraphSize,
    );
    if (paragraphSentences.length === 0) continue;
    const segments: RichTextSegment[] = paragraphSentences.flatMap(
      (sentence, sentenceIndex): RichTextSegment[] => sentenceIndex === 0
        ? [...sentence.segments]
        : [{ type: "text", text: "　" }, ...sentence.segments],
    );
    paragraphs.push({
      paragraph_id: `paragraph_${index + 1}`,
      sentence_ids: paragraphSentences.map((sentence) => sentence.sentence_id),
      plainText: plainFromSegments(segments),
      segments,
    });
  }
  return paragraphs;
}

export function buildPassageSegments(
  paragraphs: readonly StoryParagraph[],
): RichTextSegment[] {
  return paragraphs.flatMap((paragraph, index): RichTextSegment[] => index === 0
    ? [...paragraph.segments]
    : [{ type: "text", text: "\n" }, ...paragraph.segments]);
}
