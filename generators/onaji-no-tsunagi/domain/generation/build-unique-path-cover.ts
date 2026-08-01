/**
 * 盤面全体を覆う経路を先に組み立て、作問用のpath plan候補を生成する。
 *
 * このmoduleはsolution-first構成の公開入口であり、profile、経路候補、
 * exact-cover探索、記号割当の詳細を専用moduleへ委譲する。後段が
 * 独立solverで検証できるよう、返却するPuzzleへ植え込みpartnerを含めない。
 *
 * @packageDocumentation
 */

import {indexToCell} from '../grid/coordinates.ts';
import type {
  AvailableDifficultyLevel,
  TerminalPlacementSearchDiagnostics,
} from '../types/generation.ts';
import type {SymbolId, UniquePathCoverProfileId} from '../types/puzzle.ts';
import {
  assignProfilePathSymbols,
  canReuseRouteCover,
} from './generation-profile-adapter.ts';
import {
  materializePathPlan,
  type MaterializedPathPlan,
  type PlannedPath,
  type RouteRole,
} from './materialize-path-plan.ts';
import {getPathCandidateSource} from './path-candidate-source.ts';
import {type SeededRandom} from './random.ts';
import {
  chooseUniquePathCoverProfileId,
  findUniquePathCoverProfile,
  type UniquePathCoverProfile,
} from './unique-path-cover-profile.ts';
import {selectPathCover, type PathCoverResult} from './select-path-cover.ts';
import {createTerminalPlacementSearch} from './terminal-placement-policy.ts';

export type {UniquePathCoverProfile} from './unique-path-cover-profile.ts';

/**
 * exact-cover構成の結果。
 *
 * `built`は植え込み経路を構成できたことだけを示す。問題の有効性、唯一解、
 * 最適性は後段の独立validator・solver・optimizerで証明する。
 */
type BuildUniquePathCoverResult =
  | {
      readonly status: 'built';
      readonly plan: MaterializedPathPlan;
      readonly constructionStateCount: number;
      readonly pathLengthProfile: readonly number[];
      readonly terminalPlacementDiagnostics?: TerminalPlacementSearchDiagnostics;
    }
  | {
      readonly status: 'not_constructed';
      readonly constructionStateCount: number;
      readonly terminalPlacementDiagnostics?: TerminalPlacementSearchDiagnostics;
    }
  | {
      readonly status: 'budget_exhausted';
      readonly constructionStateCount: number;
      readonly terminalPlacementDiagnostics?: TerminalPlacementSearchDiagnostics;
    }
  | {
      readonly status: 'symbol_assignment_unavailable';
      readonly constructionStateCount: number;
      readonly terminalPlacementDiagnostics: TerminalPlacementSearchDiagnostics;
    };

interface BuildUniquePathCoverOptions {
  readonly symbolAssignmentVariant?: number;
  readonly materializedPuzzleSeed?: string;
}

interface CachedRouteCover {
  readonly cacheKey: string;
  readonly lengths: readonly number[];
  readonly result: PathCoverResult;
  readonly allowedSymbolAssignments?: readonly (readonly SymbolId[])[];
  readonly terminalPlacementDiagnostics?: TerminalPlacementSearchDiagnostics;
}

let lastReusableRouteCover: CachedRouteCover | undefined;

/** profile IDに対応する読取専用の構成・品質gateを返す。 */
export function getUniquePathCoverProfile(
  profileId: UniquePathCoverProfileId,
): UniquePathCoverProfile {
  return findUniquePathCoverProfile(profileId);
}

/**
 * 難易度、Worksheet内の位置、問題数、request seedからprofileを決定する。
 *
 * @remarks
 * 複数問では仕様で固定した並びを使い、一問だけの場合にseedで候補を選ぶ。
 *
 * @throws `RangeError`
 * `puzzleIndex`がWorksheet範囲外、または未対応の条件の場合。
 */
export function selectUniquePathCoverProfileId(
  difficulty: AvailableDifficultyLevel,
  requestSeed: string,
  puzzleIndex: number,
  puzzleCount: number,
): UniquePathCoverProfileId {
  return chooseUniquePathCoverProfileId(
    difficulty,
    requestSeed,
    puzzleIndex,
    puzzleCount,
  );
}

/**
 * 独立した低曲がり経路のexact coverをsolution-firstで構成し、端点化する。
 *
 * @remarks
 * 5×5の候補集合と列挙順はv3.3互換を保つ。6×6では経路geometryを
 * `routeSeed`単位で再利用し、`symbolAssignmentVariant`だけを変えて記号
 * 割り当てを探索できる。返却した`Puzzle`には植え込みpartnerを含めない。
 *
 * @param routeSeed - 経路候補と列挙順を決めるseed。
 * @param random - `routeSeed`から作成した決定的な疑似乱数source。
 * @param profileId - 盤面寸法、端点数、形状gate、探索予算を選ぶprofile。
 * @param options - 6×6の記号割り当てvariantと、成果物ID用のseed。
 * @returns 構成済みplan、構成不能、構成予算超過のいずれか。
 */
export function buildUniquePathCover(
  routeSeed: string,
  random: SeededRandom,
  profileId: UniquePathCoverProfileId,
  options: BuildUniquePathCoverOptions = {},
): BuildUniquePathCoverResult {
  const profile = findUniquePathCoverProfile(profileId);
  const routeCover = buildOrReuseRouteCover(routeSeed, random, profile);
  if (!hasExpectedPathLengths(routeCover.lengths, profile)) {
    return {status: 'not_constructed', constructionStateCount: 0};
  }
  if (routeCover.result.status !== 'built') {
    return routeCover.terminalPlacementDiagnostics === undefined
      ? routeCover.result
      : {
          ...routeCover.result,
          terminalPlacementDiagnostics: routeCover.terminalPlacementDiagnostics,
        };
  }

  const symbolAssignmentVariant = options.symbolAssignmentVariant ?? 0;
  const symbols =
    routeCover.allowedSymbolAssignments?.[symbolAssignmentVariant] ??
    (routeCover.allowedSymbolAssignments === undefined
      ? assignProfilePathSymbols(
          profile,
          routeSeed,
          random,
          symbolAssignmentVariant,
        )
      : undefined);
  if (symbols === undefined) {
    if (routeCover.terminalPlacementDiagnostics !== undefined) {
      return {
        status: 'symbol_assignment_unavailable',
        constructionStateCount: routeCover.result.constructionStateCount,
        terminalPlacementDiagnostics: routeCover.terminalPlacementDiagnostics,
      };
    }
    throw new TypeError('terminal symbol assignment is unavailable');
  }
  if (symbols.length !== profile.pathCount) {
    throw new TypeError('terminal profile does not match its path count');
  }

  const paths: readonly PlannedPath[] = routeCover.result.paths.map(
    (candidate, index) => ({
      role: routeRoleForPathIndex(index),
      symbol: symbols[index] ?? 'circle',
      cells: candidate.cells.map(cellIndex =>
        indexToCell(cellIndex, profile.width),
      ),
    }),
  );
  return {
    status: 'built',
    plan: materializePathPlan(
      paths,
      profile.width,
      profile.height,
      options.materializedPuzzleSeed ?? routeSeed,
    ),
    constructionStateCount: routeCover.result.constructionStateCount,
    pathLengthProfile: [...routeCover.lengths],
    ...(routeCover.terminalPlacementDiagnostics === undefined
      ? {}
      : {
          terminalPlacementDiagnostics: routeCover.terminalPlacementDiagnostics,
        }),
  };
}

function buildOrReuseRouteCover(
  routeSeed: string,
  random: SeededRandom,
  profile: UniquePathCoverProfile,
): {
  readonly lengths: readonly number[];
  readonly result: PathCoverResult;
  readonly allowedSymbolAssignments?: readonly (readonly SymbolId[])[];
  readonly terminalPlacementDiagnostics?: TerminalPlacementSearchDiagnostics;
} {
  const cacheKey = `${profile.profileId}|${routeSeed}`;
  if (
    canReuseRouteCover(profile) &&
    lastReusableRouteCover?.cacheKey === cacheKey
  ) {
    return lastReusableRouteCover;
  }

  const lengths =
    profile.pathLengthProfiles[
      random.integer(0, profile.pathLengthProfiles.length - 1)
    ] ?? [];
  const terminalPlacementSearch =
    profile.terminalPlacementPolicy === null
      ? undefined
      : createTerminalPlacementSearch(
          profile.terminalPlacementPolicy,
          profile.width,
          profile.height,
          profile.symbolPathCounts,
          routeSeed,
        );
  const result = selectPathCover(
    lengths,
    random,
    profile,
    getPathCandidateSource(profile),
    terminalPlacementSearch,
  );
  const allowedSymbolAssignments =
    result.status === 'built' && terminalPlacementSearch !== undefined
      ? terminalPlacementSearch.allowedSymbolAssignments(result.paths)
      : undefined;
  const terminalPlacementDiagnostics = terminalPlacementSearch?.diagnostics();
  const routeCover = {
    lengths,
    result,
    ...(allowedSymbolAssignments === undefined
      ? {}
      : {allowedSymbolAssignments}),
    ...(terminalPlacementDiagnostics === undefined
      ? {}
      : {terminalPlacementDiagnostics}),
  };
  if (canReuseRouteCover(profile)) {
    lastReusableRouteCover = {cacheKey, ...routeCover};
  }
  return routeCover;
}

function hasExpectedPathLengths(
  lengths: readonly number[],
  profile: UniquePathCoverProfile,
): boolean {
  const cellCount = profile.width * profile.height;
  return (
    lengths.length === profile.pathCount &&
    lengths.reduce((sum, length) => sum + length, 0) === cellCount
  );
}

function routeRoleForPathIndex(index: number): RouteRole {
  if (index === 0) {
    return 'thread';
  }
  if (index === 1) {
    return 'spine';
  }
  return 'scaffold';
}
