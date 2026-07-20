import type { LexemeId } from "./ids.js";

export interface TextSegment {
  readonly type: "text";
  readonly text: string;
  readonly lexeme_id?: LexemeId;
}

export interface RubySegment {
  readonly type: "ruby";
  readonly base: string;
  readonly reading: string;
  readonly lexeme_id: LexemeId;
}

export type RichTextSegment = TextSegment | RubySegment;

export interface RichText {
  readonly plainText: string;
  readonly segments: readonly RichTextSegment[];
}
