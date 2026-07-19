import type { Grade, GenerationProfile, StoryLength } from "./generation.js";
import type {
  AnchorId,
  BlueprintId,
  LexemeId,
  QuestionSetBlueprintId,
  SentenceId,
  StoryStructureId,
} from "./ids.js";
import type { Question } from "./questions.js";
import type { StoryPlanV1 } from "./story-plan.js";
import type { RichText, RichTextSegment } from "./text.js";

export interface StorySentence extends RichText {
  readonly sentence_id: SentenceId;
  readonly role: string;
}

export interface StoryParagraph extends RichText {
  readonly paragraph_id: string;
  readonly sentence_ids: readonly SentenceId[];
}

export interface MachineCheck {
  readonly check_id: string;
  readonly passed: boolean;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface MachineCheckReport {
  readonly all_passed: boolean;
  readonly checks: readonly MachineCheck[];
  readonly quality_assessment: {
    readonly status: "not_formally_assessed";
    readonly score: null;
    readonly reason: string;
  };
}

export interface RubyPlanOccurrence {
  readonly lexeme_id: LexemeId;
  readonly surface: string;
  readonly reading: string;
  readonly scope: string;
  readonly location_id: string;
  readonly occurrence_index: number;
  readonly render_ruby: boolean;
  readonly reason: "grade_known" | "first_occurrence" | "repeat_occurrence";
}

export interface Worksheet {
  readonly item_id: string;
  readonly item_revision: number;
  readonly lifecycle_status: "automated_checks_passed";
  readonly usage_class: "development_preview";
  readonly child_use_permitted: false;
  readonly text_type: "narrative";
  readonly blueprint_id: BlueprintId;
  readonly story_structure_id: StoryStructureId;
  readonly question_set_blueprint_id: QuestionSetBlueprintId;
  readonly anchor_ids: readonly AnchorId[];
  readonly grade: Grade;
  readonly generation_profile: GenerationProfile;
  readonly story_length: StoryLength;
  readonly seed: string | number;
  readonly requested_topic: string | null;
  readonly story_plan: StoryPlanV1 | null;
  readonly title: RichText;
  readonly passage: {
    readonly plainText: string;
    readonly segments: readonly RichTextSegment[];
    readonly character_count: number;
    readonly sentences: readonly StorySentence[];
    readonly paragraphs: readonly StoryParagraph[];
  };
  readonly questions: readonly Question[];
  readonly total_points: number;
  readonly story: {
    readonly genre: "物語文";
    readonly category: string;
    readonly setting_lexeme_id: LexemeId;
    readonly protagonist: {
      readonly name: string;
      readonly trait: string;
      readonly goal: string;
    };
    readonly supporting_character: string;
    readonly event: {
      readonly problem: string | null;
      readonly resolution: string;
      readonly emotion_before: string | null;
      readonly emotion_after: string | null;
      readonly clue?: string;
    };
  };
  readonly orthography: {
    readonly mode: string;
    readonly grade_kanji_source: string;
    readonly vocabulary_source: string;
    readonly vocabulary_database_used: false;
    readonly vocabulary_candidate_database_consulted: string;
    readonly vocabulary_candidate_evidence_scope: "prototype_lexicon_occurrences_only";
    readonly phrase_spacing: "ideographic-space-v0.1";
    readonly scope_policy: readonly string[];
  };
  readonly ruby_plan: readonly RubyPlanOccurrence[];
  readonly vocabulary_audit: {
    readonly database_release: string;
    readonly coverage_scope: "prototype_lexicon_occurrences_only";
    readonly generation_policy: "candidate evidence only; not a manual approval";
    readonly checked_occurrence_count: number;
    readonly checked_lexeme_count: number;
    readonly occurrences: readonly {
      readonly lexeme_id: LexemeId;
      readonly source_lexeme_id: string | null;
      readonly surface: string;
      readonly reading: string;
      readonly grade_band: string | null;
      readonly evidence_status: string;
      readonly location_id: string;
      readonly scope: string;
    }[];
  };
  readonly generation_provenance: {
    readonly generator_version: string;
    readonly algorithm_spec_version: string;
    readonly blueprint_version: string;
    readonly blueprint_id: BlueprintId;
    readonly question_set_blueprint_id: QuestionSetBlueprintId;
    readonly database_release: string;
    readonly vocabulary_candidate_database_release: string;
    readonly template_version: string;
    readonly story_structure_id: StoryStructureId;
    readonly generation_source: "local" | "local_fallback" | "ai_proxy";
    readonly fallback_reason: string | null;
    readonly candidate_id: string | null;
    readonly proxy_request_id: string | null;
    readonly prompt_version: string | null;
    readonly prompt_hash: string | null;
    readonly context_version: string | null;
    readonly model: string | null;
    readonly model_settings: Readonly<Record<string, unknown>> | null;
    readonly story_plan_hash: string | null;
    readonly normalization_version: string;
    readonly ruby_processor_version: string;
    readonly generated_at: null;
    readonly seed: string;
  };
  readonly manual_check: { readonly status: "not_started" };
  readonly calibration: { readonly status: "not_calibrated" };
  readonly machine_checks: MachineCheckReport & { readonly all_passed: true };
}

export type WorksheetCheckInput = Omit<Worksheet, "lifecycle_status" | "machine_checks"> & {
  readonly lifecycle_status: "generated_pending_checks" | "automated_checks_passed";
};
