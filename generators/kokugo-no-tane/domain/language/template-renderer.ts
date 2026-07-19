import type { LanguageDataProvider } from "./language-data-provider.js";
import type { Grade } from "../types/generation.js";
import type { LexemeId } from "../types/ids.js";
import type { RichText, RichTextSegment } from "../types/text.js";
import type { RubyPlanOccurrence } from "../types/worksheet.js";

export type TemplateRenderer = (
  template: string,
  scope: string,
  locationId: string,
) => RichText;

export function plainFromSegments(segments: readonly RichTextSegment[]): string {
  return segments
    .map((segment) => segment.type === "ruby" ? segment.base : segment.text)
    .join("");
}

export function applyPhraseSpacing(
  segments: readonly RichTextSegment[],
): RichTextSegment[] {
  return segments.map((segment) => (
    segment.type === "text" && !segment.lexeme_id
      ? { ...segment, text: segment.text.replaceAll("|", "　") }
      : segment
  ));
}

export function compactText(text: unknown): string {
  return String(text).replace(/[\s　]+/gu, "");
}

export function createTemplateRenderer(
  grade: Grade,
  rubyPlan: RubyPlanOccurrence[],
  language: LanguageDataProvider,
): TemplateRenderer {
  const knownKanji = language.getKnownKanji(grade);
  const seenByScope = new Map<string, Set<string>>();
  const occurrenceByScope = new Map<string, number>();

  return (template, scope, locationId) => {
    const seen = seenByScope.get(scope) ?? new Set<string>();
    seenByScope.set(scope, seen);
    const segments: RichTextSegment[] = [];
    const pattern = /\{\{([a-z_]+)\}\}/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(template)) !== null) {
      if (match.index > cursor) {
        segments.push({ type: "text", text: template.slice(cursor, match.index) });
      }
      const lexemeId = match[1];
      if (lexemeId === undefined) throw new Error("prototype lexeme capture is missing");
      const lexeme = language.requireLexeme(lexemeId);

      const occurrenceKey = `${scope}:${lexemeId}`;
      const occurrenceIndex = (occurrenceByScope.get(occurrenceKey) ?? 0) + 1;
      occurrenceByScope.set(occurrenceKey, occurrenceIndex);
      const kanji = Array.from(lexeme.surface)
        .filter((character) => /\p{Script=Han}/u.test(character));
      const known = kanji.every((character) => knownKanji.has(character));
      const needsFirstOccurrenceRuby = kanji.length > 0 && (grade === 1 || !known);
      const firstRubyOccurrence = needsFirstOccurrenceRuby && !seen.has(lexemeId);
      if (needsFirstOccurrenceRuby) seen.add(lexemeId);

      const brandedLexemeId = lexeme.id as LexemeId;
      segments.push(firstRubyOccurrence
        ? { type: "ruby", base: lexeme.surface, reading: lexeme.reading, lexeme_id: brandedLexemeId }
        : { type: "text", text: lexeme.surface, lexeme_id: brandedLexemeId });
      rubyPlan.push({
        lexeme_id: brandedLexemeId,
        surface: lexeme.surface,
        reading: lexeme.reading,
        scope,
        location_id: locationId,
        occurrence_index: occurrenceIndex,
        render_ruby: firstRubyOccurrence,
        reason: !needsFirstOccurrenceRuby
          ? "grade_known"
          : firstRubyOccurrence ? "first_occurrence" : "repeat_occurrence",
      });
      cursor = pattern.lastIndex;
    }
    if (cursor < template.length) {
      segments.push({ type: "text", text: template.slice(cursor) });
    }
    const renderedSegments = scope === "title" ? segments : applyPhraseSpacing(segments);
    return { plainText: plainFromSegments(renderedSegments), segments: renderedSegments };
  };
}
