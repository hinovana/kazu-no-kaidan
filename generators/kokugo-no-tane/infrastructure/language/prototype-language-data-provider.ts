// This is deliberately small and explicit. It is a prototype reading-support
// lexicon, not the vocabulary/readings DB specified for a release version.
import type {
  LanguageDataProvider,
  Lexeme,
} from "../../domain/language/language-data-provider.js";
import type { Grade } from "../../domain/types/generation.js";
import type { LexemeId } from "../../domain/types/ids.js";
import {
  KANJI_DATABASE_RELEASE,
  getKnownKanjiSet,
  isKnownOrthography,
} from "./kanji-data.ts";

export interface PrototypeLexeme {
  readonly surface: string;
  readonly reading: string;
  readonly vocabulary_grade: Grade;
}

export const PROTOTYPE_LEXICON = Object.freeze({
  school: { surface: "学校", reading: "がっこう", vocabulary_grade: 1 },
  home: { surface: "家", reading: "いえ", vocabulary_grade: 1 },
  classroom: { surface: "教室", reading: "きょうしつ", vocabulary_grade: 1 },
  park: { surface: "公園", reading: "こうえん", vocabulary_grade: 1 },
  library: { surface: "図書館", reading: "としょかん", vocabulary_grade: 1 },
  square: { surface: "広場", reading: "ひろば", vocabulary_grade: 1 },
  forest: { surface: "森", reading: "もり", vocabulary_grade: 1 },
  preparation: { surface: "準備", reading: "じゅんび", vocabulary_grade: 1 },
  relief: { surface: "安心", reading: "あんしん", vocabulary_grade: 1 },
  question: { surface: "問題", reading: "もんだい", vocabulary_grade: 1 },
  feeling: { surface: "気持ち", reading: "きもち", vocabulary_grade: 1 },
} satisfies Readonly<Record<string, PrototypeLexeme>>);

export class PrototypeLanguageDataProvider implements LanguageDataProvider {
  readonly releaseId = KANJI_DATABASE_RELEASE;
  readonly vocabularySource = "prototype_lexicon";

  getKnownKanji(grade: Grade): ReadonlySet<string> {
    return getKnownKanjiSet(grade);
  }

  resolveLexeme(id: string): Lexeme | undefined {
    const entry: PrototypeLexeme | undefined = PROTOTYPE_LEXICON[
      id as keyof typeof PROTOTYPE_LEXICON
    ];
    if (entry === undefined) return undefined;
    return {
      id: id as LexemeId,
      surface: entry.surface,
      reading: entry.reading,
      vocabularyGrade: entry.vocabulary_grade,
    };
  }

  requireLexeme(id: string): Lexeme {
    const lexeme = this.resolveLexeme(id);
    if (lexeme === undefined) throw new Error(`unknown prototype lexeme: ${id}`);
    return lexeme;
  }

  isKnownOrthography(surface: string, grade: Grade): boolean {
    return isKnownOrthography(surface, grade);
  }
}

export const PROTOTYPE_LANGUAGE_DATA_PROVIDER = new PrototypeLanguageDataProvider();

export { KANJI_DATABASE_RELEASE, getKnownKanjiSet, isKnownOrthography };
