declare const blueprintIdBrand: unique symbol;
declare const storyStructureIdBrand: unique symbol;
declare const lexemeIdBrand: unique symbol;
declare const sentenceIdBrand: unique symbol;
declare const anchorIdBrand: unique symbol;
declare const questionPatternIdBrand: unique symbol;
declare const questionSetBlueprintIdBrand: unique symbol;
declare const answerLayoutIdBrand: unique symbol;

export type BlueprintId = string & {
  readonly [blueprintIdBrand]: true;
};

export type StoryStructureId = string & {
  readonly [storyStructureIdBrand]: true;
};

export type LexemeId = string & {
  readonly [lexemeIdBrand]: true;
};

export type SentenceId = string & {
  readonly [sentenceIdBrand]: true;
};

export type AnchorId = string & {
  readonly [anchorIdBrand]: true;
};

export type QuestionPatternId = string & {
  readonly [questionPatternIdBrand]: true;
};

export type QuestionSetBlueprintId = string & {
  readonly [questionSetBlueprintIdBrand]: true;
};

export type AnswerLayoutId = string & {
  readonly [answerLayoutIdBrand]: true;
};
