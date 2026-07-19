import type { Grade } from "../types/generation.js";
import type { LexemeId } from "../types/ids.js";

export interface Lexeme {
  readonly id: LexemeId;
  readonly surface: string;
  readonly reading: string;
  readonly vocabularyGrade: Grade;
}

export interface LanguageDataProvider {
  readonly releaseId: string;
  readonly vocabularySource: string;

  getKnownKanji(grade: Grade): ReadonlySet<string>;
  resolveLexeme(id: string): Lexeme | undefined;
  requireLexeme(id: string): Lexeme;
  isKnownOrthography(surface: string, grade: Grade): boolean;
}
