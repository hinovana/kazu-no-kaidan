import type { GeneratorEntry } from "./generator-module.js";

const baseUrl = import.meta.env.BASE_URL;

export const generatorRegistry = [
  {
    kind: "legacy",
    id: "kazu-sagashi",
    title: "かずさがし",
    description: "3×3の枠に指定されたリンゴとナシの数や関係がある場所を探します。",
    href: `${baseUrl}generators/kazu-sagashi/`,
  },
  {
    kind: "legacy",
    id: "kazu-no-kaidan",
    title: "数字の階段",
    description: "等差数列のルールを使った問題・解答・解き方を生成します。",
    href: `${baseUrl}generators/kazu-no-kaidan/`,
  },
  {
    kind: "react",
    id: "kokugo-no-tane",
    title: "こくごのたね",
    description: "小学1〜3年生向けの物語文と読解問題を作る、構造的自動検査済み・人間未確認の開発プロトタイプです。",
    path: "/generators/kokugo-no-tane",
    load: async () => (await import("../../generators/kokugo-no-tane/module.tsx")).default,
  },
] as const satisfies readonly GeneratorEntry[];
