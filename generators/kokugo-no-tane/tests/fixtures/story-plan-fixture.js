export function createStoryPlanFixture(overrides = {}) {
  const base = {
    schema_version: "story-plan.v1",
    category: "町",
    title_concept: "まちたんけんのちず",
    setting: { type: "public_space", name: "まちのひろば" },
    protagonist: { name: "あお", role: "しょうがくせい" },
    supporting_character: { name: "ゆう", role: "ともだち" },
    goal: "まちたんけんのちずをかんせいさせる",
    event: {
      action: "めじるしをかこう",
      problem: "めじるしをちがうばしょにかいてしまいました",
      decision: "あるいたじゅんばんをたしかめること",
      resolution: "ただしいばしょへかきなおしました",
    },
    emotion: { before: "うれしい", after: "はずかしい" },
    evidence_requirements: [
      "せいかくをしめすことばをおける",
      "しっぱいをみられたばめんとはんのうをわけられる",
    ],
  };
  return merge(base, overrides);
}

function merge(base, overrides) {
  return Object.fromEntries(Object.entries(base).map(([key, value]) => {
    const override = overrides[key];
    if (isRecord(value) && isRecord(override)) return [key, { ...value, ...override }];
    return [key, override === undefined ? value : override];
  }));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
