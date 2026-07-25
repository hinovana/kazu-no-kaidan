import type { GenerationProfile } from "../types/generation.js";
import type {
  LengthSetting,
  StorySentenceDraft,
} from "./blueprint.js";
import type { NarrativeFunction } from "../types/story.js";

export type ExpansionStage = "before" | "working" | "between_evidence" | "resolution";

export interface StoryExpansionCandidate {
  readonly id: string;
  readonly text: string;
  readonly narrativeFunction: NarrativeFunction;
  readonly referenceTargetRole?: string;
}

export type StoryExpansionPack = Readonly<Record<
  ExpansionStage,
  readonly StoryExpansionCandidate[]
>>;

export type SelectedStoryExpansions = Readonly<Record<
  ExpansionStage,
  readonly StorySentenceDraft[]
>>;

const REQUIRED_BETWEEN_EVIDENCE = [0, 0, 1, 2, 4] as const;

/**
 * 本文長と根拠距離を、意味役割付きの展開文へ割り当てる。
 */
export function selectStoryExpansions({
  pack,
  profile,
  lengthSetting,
  random,
}: {
  readonly pack: StoryExpansionPack;
  readonly profile: GenerationProfile;
  readonly lengthSetting: LengthSetting;
  readonly random: () => number;
}): SelectedStoryExpansions {
  validatePack(pack);
  const requiredBetweenCount = REQUIRED_BETWEEN_EVIDENCE[profile - 1] ?? 0;
  const expansionCount = Math.max(lengthSetting.expansion_count, requiredBetweenCount);
  const remainingCount = expansionCount - requiredBetweenCount;
  const beforeCount = Math.ceil(remainingCount / 3);
  const workingCount = Math.ceil((remainingCount - beforeCount) / 2);
  const counts: Readonly<Record<ExpansionStage, number>> = {
    before: beforeCount,
    working: workingCount,
    between_evidence: requiredBetweenCount,
    resolution: expansionCount - beforeCount - workingCount - requiredBetweenCount,
  };

  const selectStage = (stage: ExpansionStage): readonly StorySentenceDraft[] => {
    const count = counts[stage];
    if (count > pack[stage].length) {
      throw new RangeError(`not enough ${stage} story expansions: required ${count}`);
    }
    return shuffled(random, pack[stage]).slice(0, count).map((candidate): StorySentenceDraft => ({
      stage: `context_${stage}_${candidate.id}`,
      text: candidate.text,
      narrativeFunction: candidate.narrativeFunction,
      ...(candidate.referenceTargetRole === undefined
        ? {}
        : { referenceTargetRole: candidate.referenceTargetRole }),
    }));
  };

  return {
    before: selectStage("before"),
    working: selectStage("working"),
    between_evidence: selectStage("between_evidence"),
    resolution: selectStage("resolution"),
  };
}

function validatePack(pack: StoryExpansionPack): void {
  const ids = new Set<string>();
  for (const [stage, candidates] of Object.entries(pack)) {
    for (const candidate of candidates) {
      if (!/^[a-z][a-z0-9_]*$/u.test(candidate.id)) {
        throw new TypeError(`invalid story expansion id: ${candidate.id}`);
      }
      if (ids.has(candidate.id)) throw new TypeError(`duplicate story expansion id: ${candidate.id}`);
      ids.add(candidate.id);
      if (candidate.text.trim().length === 0) {
        throw new TypeError(`empty ${stage} story expansion: ${candidate.id}`);
      }
    }
  }
}

function shuffled<T>(random: () => number, values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const currentValue = result[index];
    const otherValue = result[other];
    if (currentValue === undefined || otherValue === undefined) continue;
    result[index] = otherValue;
    result[other] = currentValue;
  }
  return result;
}
