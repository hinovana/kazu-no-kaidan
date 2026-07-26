/**
 * 6×6の端点配置に関する難易度仮説を、再現可能な判定へ変換する。
 *
 * 仮説の成立と体感難易度の因果関係はここでは保証せず、対照実験で比較できる
 * boolean条件と配置統計だけを提供する。座標判定は生成器と共通のdomain実装を
 * 利用する。
 */

import {
  analyzeTerminalPlacement,
} from "../domain/validation/analyze-terminal-placement.ts";

export const CENTRAL_SYMBOL_COVERAGE_HYPOTHESIS = {
  id: "central-4x4-all-symbols",
  description:
    "外周を除いた中央4×4に、盤面で使う各記号の端点を1個以上置く。",
  targetProfileId: "6x6-4-4-2",
  centralRegion: {
    minimumRow: 1,
    maximumRow: 4,
    minimumColumn: 1,
    maximumColumn: 4,
  },
};

export const CENTRAL_TERMINAL_COUNT_HYPOTHESIS = {
  id: "central-4x4-three-to-five-terminals",
  description:
    "外周を除いた中央4×4に置く端点の合計を3個以上5個以下にする。",
  targetProfileId: "6x6-4-4-2",
  minimumTerminalCount: 3,
  maximumTerminalCount: 5,
};

export const LIMITED_EDGE_ADJACENCY_HYPOTHESIS = {
  id: "at-most-one-different-symbol-edge-adjacency",
  description:
    "外周上で隣接する端点pairは1組までにする。外周で隣接する場合は、"
    + "異なる記号同士だけを許容する。",
  targetProfileId: "6x6-4-4-2",
};

export const LIMITED_CENTRAL_ADJACENCY_HYPOTHESIS = {
  id: "at-most-one-central-adjacency",
  description:
    "中央4×4内で上下左右に隣接する端点pairを1組までにする。"
    + "記号の種類は問わない。",
  targetProfileId: "6x6-4-4-2",
};

export const TERMINAL_RUN_AND_BLOCK_HYPOTHESIS = {
  id: "reject-straight-three-l-shaped-three-and-filled-two-by-two",
  description:
    "盤面全体で縦・横に3個以上連続する端点、L字型に並ぶ3端点、"
    + "端点で埋まった2×2を許容しない。",
  targetProfileId: "6x6-4-4-2",
};

export const CONCENTRATED_ORTHOGONAL_EDGE_PAIRS_HYPOTHESIS = {
  id: "reject-three-orthogonal-pairs-on-one-outer-side",
  description:
    "同じ外周辺に接し、その辺と直交する隣接端点pairが3組以上ある"
    + "外周一辺集中型の配置を許容しない。",
  targetProfileId: "6x6-4-4-2",
  maximumPairCountPerSide: 2,
};

export const LIMITED_CENTRAL_BOUNDARY_ADJACENCY_HYPOTHESIS = {
  id: "at-most-two-central-boundary-adjacencies",
  description:
    "中央4×4と外周の境界をまたいで上下左右に隣接する端点pairを"
    + "2組までにする。",
  targetProfileId: "6x6-4-4-2",
  maximumPairCount: 2,
};

export const COMBINED_TERMINAL_PLACEMENT_HYPOTHESIS = {
  id: "bounded-central-placement-and-limited-adjacency",
  description:
    "中央4×4に全記号を1個以上、合計3〜5個置き、中央内の隣接pairを"
    + "1組までにする。外周上の隣接pairも1組までとし、外周で隣接する"
    + "場合は異なる記号同士だけを許容する。",
  targetProfileId: "6x6-4-4-2",
};

/**
 * 最終条件を適用する順序と、各条件に対応する分析結果を定義する。
 *
 * `resultKey`は`analyzeTerminalPlacementHypotheses`のboolean結果を指す。
 * 条件別の単独却下率は順序に依存しないが、段階却下率はこの配列順に依存する。
 */
export const TERMINAL_PLACEMENT_GATE_RULES = [
  {
    id: CENTRAL_SYMBOL_COVERAGE_HYPOTHESIS.id,
    label: "中央4×4に各記号1個以上",
    description: CENTRAL_SYMBOL_COVERAGE_HYPOTHESIS.description,
    resultKey: "satisfiesCentralSymbolCoverage",
  },
  {
    id: CENTRAL_TERMINAL_COUNT_HYPOTHESIS.id,
    label: "中央4×4は合計3〜5個",
    description: CENTRAL_TERMINAL_COUNT_HYPOTHESIS.description,
    resultKey: "satisfiesCentralTerminalCountRange",
  },
  {
    id: LIMITED_CENTRAL_ADJACENCY_HYPOTHESIS.id,
    label: "中央隣接は最大1ペア",
    description: LIMITED_CENTRAL_ADJACENCY_HYPOTHESIS.description,
    resultKey: "satisfiesLimitedCentralAdjacency",
  },
  {
    id: "at-most-one-edge-adjacency",
    label: "外周隣接は最大1ペア",
    description: "外周上で上下左右に隣接する端点pairを1組までにする。",
    resultKey: "satisfiesEdgeAdjacencyPairLimit",
  },
  {
    id: "reject-same-symbol-edge-adjacency",
    label: "外周の同記号隣接を禁止",
    description:
      "外周上で隣接する場合は異なる記号同士だけを許容し、"
      + "同じ記号同士を許容しない。",
    resultKey: "satisfiesDifferentSymbolEdgeAdjacency",
  },
  {
    id: "reject-straight-terminal-triples",
    label: "縦3連・横3連を禁止",
    description:
      "盤面全体で端点が縦または横に3個以上連続する配置を許容しない。",
    resultKey: "satisfiesNoStraightTerminalRun",
  },
  {
    id: "reject-filled-two-by-two-terminal-blocks",
    label: "端点で埋まる2×2を禁止",
    description: "4マスすべてが端点で埋まる2×2を許容しない。",
    resultKey: "satisfiesNoFilledTwoByTwoTerminalBlock",
  },
  {
    id: "reject-l-shaped-terminal-triples",
    label: "L字型3連を禁止",
    description: "2×2のうち3マスを端点が占めるL字型の3連を許容しない。",
    resultKey: "satisfiesNoLShapedTerminalTriple",
  },
  {
    id: LIMITED_CENTRAL_BOUNDARY_ADJACENCY_HYPOTHESIS.id,
    label: "中央・外周境界は最大2ペア",
    description: LIMITED_CENTRAL_BOUNDARY_ADJACENCY_HYPOTHESIS.description,
    resultKey: "satisfiesLimitedCentralBoundaryAdjacency",
  },
  {
    id: CONCENTRATED_ORTHOGONAL_EDGE_PAIRS_HYPOTHESIS.id,
    label: "外周一辺集中型3ペアを禁止",
    description: CONCENTRATED_ORTHOGONAL_EDGE_PAIRS_HYPOTHESIS.description,
    resultKey: "satisfiesNoConcentratedOrthogonalEdgePairs",
  },
];

/** 生成器と同じdomain実装で、監査用の端点配置統計を返す。 */
export const analyzeTerminalPlacementHypotheses =
  analyzeTerminalPlacement;
