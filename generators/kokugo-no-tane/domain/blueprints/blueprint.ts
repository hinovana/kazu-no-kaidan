import type { TemplateRenderer } from "../language/template-renderer.js";
import type { GenerationProfile } from "../types/generation.js";
import type {
  AnchorId,
  BlueprintId,
  SentenceId,
  StoryStructureId,
} from "../types/ids.js";
import type { Question } from "../types/questions.js";
import type { StoryPlanV1 } from "../types/story-plan.js";
import type {
  MachineCheck,
  Worksheet,
  WorksheetCheckInput,
} from "../types/worksheet.js";

export interface LengthSetting {
  readonly extra_count: number;
  readonly character_band: readonly [number, number];
  readonly label: string;
}

export interface StorySentenceDraft {
  readonly stage: string;
  readonly text: string;
}

export interface BlueprintTrait {
  readonly term: string;
}

export interface ScenarioInput {
  readonly storyPlan: StoryPlanV1 | null;
  readonly topic: string | undefined;
  readonly random: () => number;
}

export interface Blueprint<TScenario, TTrait extends BlueprintTrait> {
  readonly id: BlueprintId;
  readonly storyStructureId: StoryStructureId;
  readonly textType: "narrative";
  readonly genre: "物語文";
  readonly anchorIds: readonly AnchorId[];
  readonly evidenceRoles: readonly string[];

  createScenario(input: ScenarioInput): TScenario;
  pickTrait(random: () => number): TTrait;
  buildTitle(input: { readonly scenario: TScenario }): string;
  buildStorySentences(input: {
    readonly scenario: TScenario;
    readonly trait: TTrait;
    readonly profile: GenerationProfile;
    readonly lengthSetting: LengthSetting;
    readonly random: () => number;
  }): readonly StorySentenceDraft[];
  buildQuestions(input: {
    readonly render: TemplateRenderer;
    readonly scenario: TScenario;
    readonly trait: string;
    readonly evidence: Readonly<Record<string, SentenceId>>;
    readonly random: () => number;
    readonly profile: GenerationProfile;
  }): readonly Question[];
  buildStoryMetadata(input: {
    readonly scenario: TScenario;
    readonly trait: TTrait;
    readonly storyPlan: StoryPlanV1 | null;
  }): Worksheet["story"];
  templateVersion(input: { readonly storyPlan: StoryPlanV1 | null }): string;
  runMachineChecks(worksheet: WorksheetCheckInput): readonly MachineCheck[];
}

export type ResolvedBlueprint = Blueprint<unknown, BlueprintTrait>;
