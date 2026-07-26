/**
 * 盤面profileの版、seed互換、記号割当、cover再利用方針を実行手順へ変換する。
 *
 * 制御層がdifficultyや盤面寸法で世代固有の分岐を持たないようにし、新profile
 * 追加時の互換方針をprofile定義とこのadapter内で完結させる。
 *
 * @packageDocumentation
 */

import type {SymbolId} from '../types/puzzle.ts';
import {
  assignFiveByFivePathSymbols,
  assignSixBySixPathSymbols,
  countPathSymbolAssignments,
} from './path-symbol-assignment.ts';
import type {SeededRandom} from './random.ts';
import type {UniquePathCoverProfile} from './unique-path-cover-profile.ts';

/** Worksheetと来歴へ保存する、profile世代に対応した版集合。 */
export interface GeneratorVersions {
  readonly schemaVersion:
    'onaji-no-tsunagi.worksheet.v3.3' | 'onaji-no-tsunagi.worksheet.v3.4-draft';
  readonly generatorVersion:
    'onaji-no-tsunagi-generator.v3.3' | 'onaji-no-tsunagi-generator.v3.4-draft';
  readonly algorithmSpecVersion:
    'onaji-no-tsunagi-spec.v3.3' | 'onaji-no-tsunagi-spec.v3.4-draft';
  readonly analyzerVersion:
    | 'onaji-no-tsunagi-difficulty.v3.3'
    | 'onaji-no-tsunagi-difficulty.v3.4-draft';
  readonly profileVersion:
    'onaji-no-tsunagi-profiles.v3.3' | 'onaji-no-tsunagi-profiles.v3.4-draft';
}

/** 一候補を再現する経路seed、成果物seed、記号割当variant。 */
export interface ProfileCandidateIdentity {
  readonly routeSeed: string;
  readonly puzzleSeed: string;
  readonly symbolAssignmentVariant: number;
}

const VERSIONS_BY_TRACK = {
  'v3.3-stable': {
    schemaVersion: 'onaji-no-tsunagi.worksheet.v3.3',
    generatorVersion: 'onaji-no-tsunagi-generator.v3.3',
    algorithmSpecVersion: 'onaji-no-tsunagi-spec.v3.3',
    analyzerVersion: 'onaji-no-tsunagi-difficulty.v3.3',
    profileVersion: 'onaji-no-tsunagi-profiles.v3.3',
  },
  'v3.4-draft': {
    schemaVersion: 'onaji-no-tsunagi.worksheet.v3.4-draft',
    generatorVersion: 'onaji-no-tsunagi-generator.v3.4-draft',
    algorithmSpecVersion: 'onaji-no-tsunagi-spec.v3.4-draft',
    analyzerVersion: 'onaji-no-tsunagi-difficulty.v3.4-draft',
    profileVersion: 'onaji-no-tsunagi-profiles.v3.4-draft',
  },
} as const satisfies Readonly<
  Record<
    UniquePathCoverProfile['generationPolicy']['versionTrack'],
    GeneratorVersions
  >
>;

/** profileが属する版trackからWorksheetの版集合を返す。 */
export function getGeneratorVersions(
  profile: UniquePathCoverProfile,
): GeneratorVersions {
  return VERSIONS_BY_TRACK[profile.generationPolicy.versionTrack];
}

/**
 * profileの記号割当方針で、一つのroute coverに試すvariant数を返す。
 */
export function getProfileSymbolAssignmentVariantCount(
  profile: UniquePathCoverProfile,
): number {
  if (
    profile.generationPolicy.symbolAssignmentStrategy ===
    'legacy-seeded-shuffle'
  ) {
    return 1;
  }
  return countPathSymbolAssignments(profile.symbolPathCounts);
}

/**
 * profileのseed互換方針に従い、一候補の経路と成果物のseedを組み立てる。
 */
export function createProfileCandidateIdentity(
  profile: UniquePathCoverProfile,
  requestSeed: string,
  puzzleIndex: number,
  candidateIndex: number,
): ProfileCandidateIdentity {
  const generatorVersion = getGeneratorVersions(profile).generatorVersion;
  const variantCount = getProfileSymbolAssignmentVariantCount(profile);
  const routeCandidateIndex = Math.floor(candidateIndex / variantCount);
  const symbolAssignmentVariant = candidateIndex % variantCount;
  const profileSeedPart =
    profile.generationPolicy.candidateSeedStrategy === 'legacy-terminal-pattern'
      ? `terminals-${profile.terminalPattern}`
      : `profile-${profile.profileId}`;
  const routeSeed = [
    requestSeed,
    generatorVersion,
    `puzzle-${puzzleIndex + 1}`,
    profileSeedPart,
    `candidate-${routeCandidateIndex}`,
  ].join('::');
  const puzzleSeed =
    profile.generationPolicy.candidateSeedStrategy === 'legacy-terminal-pattern'
      ? routeSeed
      : `${routeSeed}::symbol-${symbolAssignmentVariant}`;
  return {routeSeed, puzzleSeed, symbolAssignmentVariant};
}

/**
 * profileが宣言したstrategyで、構成済み経路へ記号を割り当てる。
 */
export function assignProfilePathSymbols(
  profile: UniquePathCoverProfile,
  routeSeed: string,
  random: SeededRandom,
  symbolAssignmentVariant: number,
): readonly SymbolId[] {
  if (
    profile.generationPolicy.symbolAssignmentStrategy ===
    'legacy-seeded-shuffle'
  ) {
    return assignFiveByFivePathSymbols(random, profile.symbolPathCounts);
  }
  return assignSixBySixPathSymbols(
    routeSeed,
    profile.symbolPathCounts,
    symbolAssignmentVariant,
  );
}

/** 同じroute seedの記号variant間でcoverを再利用してよいかを返す。 */
export function canReuseRouteCover(profile: UniquePathCoverProfile): boolean {
  return profile.generationPolicy.reuseRouteCoverAcrossSymbolAssignments;
}
