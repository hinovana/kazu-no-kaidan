export type StoryCategory = "学校" | "家庭" | "自然" | "町" | "動物";

export type StorySettingType =
  | "school"
  | "home"
  | "park"
  | "library"
  | "public_space"
  | "forest";

export interface StoryPlanPerson {
  readonly name: string;
  readonly role: string;
}

export interface StoryPlanV1 {
  readonly schema_version: "story-plan.v1";
  readonly category: StoryCategory;
  readonly title_concept: string;
  readonly setting: {
    readonly type: StorySettingType;
    readonly name: string;
  };
  readonly protagonist: StoryPlanPerson;
  readonly supporting_character: StoryPlanPerson;
  readonly goal: string;
  readonly event: {
    readonly action: string;
    readonly problem: string;
    readonly decision: string;
    readonly resolution: string;
  };
  readonly emotion: {
    readonly before: string;
    readonly after: string;
  };
  readonly evidence_requirements: readonly [string, string, ...string[]];
}
