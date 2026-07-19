declare const blueprintIdBrand: unique symbol;
declare const storyStructureIdBrand: unique symbol;
declare const lexemeIdBrand: unique symbol;
declare const sentenceIdBrand: unique symbol;
declare const anchorIdBrand: unique symbol;

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
