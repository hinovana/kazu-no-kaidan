import { runQuestionSetChecks } from "../standard-four-question-checks.ts";
import type {
  Blueprint,
  BlueprintTrait,
  LengthSetting,
  ScenarioInput,
  StorySentenceDraft,
} from "../blueprint.js";
import type { QuestionContent } from "../../questions/question-content.js";
import type { GenerationProfile, TopicId } from "../../types/generation.js";
import type {
  AnchorId,
  BlueprintId,
  LexemeId,
  StoryStructureId,
} from "../../types/ids.js";
import type { StoryPlanV1 } from "../../types/story-plan.js";

export const STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID = "story-clue-discovery-4q.v1" as BlueprintId;
export const STORY_CLUE_DISCOVERY_STRUCTURE_ID = "story-clue-discovery.v1" as StoryStructureId;

interface ClueScenario {
  readonly category: string;
  readonly topicWords: readonly string[];
  readonly location: string;
  readonly protagonist: string;
  readonly protagonistLabel?: string;
  readonly friend: string;
  readonly friendLabel?: string;
  readonly title: string;
  readonly subject: string;
  readonly clue: string;
  readonly decision: string;
  readonly match: string;
  readonly matchFragment: string;
  readonly discovery: string;
}

interface ClueTrait extends BlueprintTrait {
  readonly sentence: string;
  readonly attention: (name: string) => string;
}

type DetailStage = "before" | "working" | "after" | "resolution";

const SCENARIOS = Object.freeze([
  {
    category: "家庭",
    topicWords: ["家", "家庭", "おうち"],
    location: "home",
    protagonist: "まな",
    friend: "たいち",
    title: "{{home}}のひかりのしるし",
    subject: "まどべに|うつる|ひかりのうごき",
    clue: "まるいひかりが、|かべのうえを|すこしずつ|うごきました",
    decision: "ひかりのばしょを|じゅんに|しるしにすること",
    match: "ならべたしるしが、|まどのかざりと|おなじかたちに|なりました",
    matchFragment: "まどのかざりとおなじかたち",
    discovery: "ひかりは、|まどのかざりを|とおって|できていました",
  },
  {
    category: "学校",
    topicWords: ["学校", "教室", "音"],
    location: "classroom",
    protagonist: "りく",
    friend: "みお",
    title: "{{classroom}}のおとのひみつ",
    subject: "つくえを|たたいたときの|おとのちがい",
    clue: "おなじつくえでも、|ばしょによって|おとが|かわりました",
    decision: "たたくばしょを|ひとつずつ|かえて|くらべること",
    match: "ひくいおとのばしょには、|つくえのしたに|ものが|はいっていました",
    matchFragment: "ひくいおとのばしょ",
    discovery: "つくえのしたのものが、|おとのちがいを|つくっていました",
  },
  {
    category: "自然",
    topicWords: ["公園", "自然", "葉", "花"],
    location: "park",
    protagonist: "さき",
    friend: "なお",
    title: "{{park}}のはっぱのならび",
    subject: "おちばの|いろと|かたち",
    clue: "にたはっぱが、|みちのはしに|つづいていました",
    decision: "はっぱを|おちているじゅんに|ならべて|くらべること",
    match: "ならべたはっぱは、|おなじきのしたへ|つづいていました",
    matchFragment: "おなじきのしたへつづいていました",
    discovery: "かぜが、|おなじきのはっぱを|みちまで|はこんでいました",
  },
  {
    category: "町",
    topicWords: ["町", "広場", "案内"],
    location: "square",
    protagonist: "あおい",
    friend: "けん",
    title: "{{square}}のしるしをたどって",
    subject: "じめんの|ちいさなしるし",
    clue: "おなじかたちのしるしが、|すこしずつ|はなれて|つづいていました",
    decision: "しるしのむきを|ひとつずつ|たどること",
    match: "さいごのしるしは、|ひろばのあんないのえと|おなじかたちでした",
    matchFragment: "あんないのえとおなじかたち",
    discovery: "しるしは、|あんないのばしょを|おしえていました",
  },
  {
    category: "動物",
    topicWords: ["動物", "こりす", "うさぎ", "森"],
    location: "forest",
    protagonist: "リリ",
    protagonistLabel: "こりすの|リリ",
    friend: "モモ",
    friendLabel: "うさぎの|モモ",
    title: "{{forest}}のあしあとをたどって",
    subject: "じめんに|のこった|ちいさなあしあと",
    clue: "まるいあとが、|きのみのそばまで|つづいていました",
    decision: "あしあとを|はなれたところから|めで|たどること",
    match: "あしあとのさきで、|ことりが|きのみを|ついばんでいました",
    matchFragment: "あしあとのさき",
    discovery: "あしあとは、|ことりが|あるいたときに|できていました",
  },
]);

const TRAITS = Object.freeze([
  {
    term: "よくきがつく",
    sentence: "よくきがつく|ひとです",
    attention: (name: string) => `${name}は、|ちいさなちがいにも|すぐに|きがつきました。`,
  },
  {
    term: "しりたがり",
    sentence: "しりたがりな|ひとです",
    attention: (name: string) => `${name}は、|ふしぎにおもうと、|もっと|しりたくなりました。`,
  },
  {
    term: "ねばりづよい",
    sentence: "ねばりづよい|ひとです",
    attention: (name: string) => `${name}は、|わかるまで|しらべることが|すきでした。`,
  },
]);

const DETAILS = Object.freeze({
  before: [
    "あたりには、|やわらかいひかりが|ひろがっていました。",
    "ふたりは、|みつけたものを|かくじゅんばんを|きめました。",
    "まわりから、|ちいさなおとが|きこえてきました。",
    "しらべるじかんは、|まだ|じゅうぶんに|ありました。",
    "ふたりは、|ならんで|あたりを|みまわしました。",
    "ともだちは、|みつけたことを|ゆっくり|はなしました。",
  ],
  working: [
    "しゅじんこうは、|ちかくからも|とおくからも|みました。",
    "ともだちは、|ちがうところを|ゆびで|しめしました。",
    "ふたりは、|にているところを|こえにだして|たしかめました。",
    "しゅじんこうは、|みつけたじゅんばんを|おぼえておきました。",
    "ともだちは、|もうひとつないか|あたりを|みました。",
    "ふたりは、|いそがずに|ひとつずつ|しらべました。",
  ],
  after: [
    "ふたりは、|ならんだしるしを|もういちど|みました。",
    "しゅじんこうは、|はじめのしるしを|あたまのなかで|おもいだしました。",
    "ともだちは、|さいごのしるしを|そっと|ゆびさしました。",
    "ふたりは、|にているところを|ひとつずつ|たしかめました。",
    "しゅじんこうは、|ふたつのしるしを|みくらべました。",
    "ともだちは、|こたえをいわずに|しずかに|まっていました。",
  ],
  resolution: [
    "ふたりは、|わかったことを|じゅんばんに|はなしました。",
    "しゅじんこうは、|みつけたしるしを|ていねいに|かきました。",
    "ともだちは、|しらべたところを|もういちど|みなおしました。",
    "ふたりは、|はじめのよそうと|くらべました。",
    "しゅじんこうは、|つながったじゅんばんを|ゆっくり|たどりました。",
    "ふたりのあいだに、|ちいさなわらいごえが|ひろがりました。",
  ],
});

function pick<T>(random: () => number, values: readonly T[]): T {
  const selected = values[Math.floor(random() * values.length)];
  if (selected === undefined) throw new RangeError("cannot pick from an empty content pack");
  return selected;
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

function removePhraseMarkers(text: unknown): string {
  return String(text).replaceAll("|", "");
}

function substitute(
  template: string,
  values: { readonly protagonist: string; readonly friend: string },
): string {
  return template
    .replaceAll("しゅじんこう", values.protagonist)
    .replaceAll("ともだち", values.friend);
}

function chooseScenario(random: () => number, topic: string | undefined): ClueScenario {
  if (topic) {
    const topicAliases: Partial<Record<TopicId, string>> = {
      school: "学校",
      home: "家庭",
      nature: "自然",
      town: "町",
      animal: "動物",
    };
    const resolvedTopic = topicAliases[topic as TopicId] ?? topic;
    const matches = SCENARIOS.filter((scenario) =>
      scenario.category === resolvedTopic
        || scenario.topicWords.some((word) => String(resolvedTopic).includes(word)),
    );
    if (matches.length > 0) return pick(random, matches);
  }
  return pick(random, SCENARIOS);
}

function buildStorySentences({
  scenario,
  trait,
  profile,
  lengthSetting,
  random,
}: {
  readonly scenario: ClueScenario;
  readonly trait: ClueTrait;
  readonly profile: GenerationProfile;
  readonly lengthSetting: LengthSetting;
  readonly random: () => number;
}): StorySentenceDraft[] {
  const values = { protagonist: scenario.protagonist, friend: scenario.friend };
  const protagonistIntro = scenario.protagonistLabel ?? scenario.protagonist;
  const friendIntro = scenario.friendLabel ?? scenario.friend;
  const core = [
    { stage: "opening", text: `{{${scenario.location}}}で、|${protagonistIntro}と|${friendIntro}は、|${scenario.subject}を|しらべていました。` },
    { stage: "trait", text: `${scenario.protagonist}は、|${trait.sentence}。` },
    { stage: "attention", text: trait.attention(scenario.protagonist) },
    { stage: "explicit_emotion", text: "なにが|わかるのか|たのしみで、|わくわくしました。" },
    { stage: "clue", text: `すると、|${scenario.clue}。` },
    { stage: "fact", text: `${scenario.protagonist}は、|${scenario.decision}に|しました。` },
    { stage: "inference_situation", text: `${scenario.match}。` },
    { stage: "inference_reaction", text: `${scenario.protagonist}は、|かおを|あげて、|${scenario.friend}に|ちいさく|うなずきました。` },
    { stage: "resolution", text: scenario.discovery + "。" },
    { stage: "closing", text: `{{${scenario.location}}}で、|ふたりは|わらいました。` },
  ];

  const requiredAfterCount = [0, 0, 1, 2, 4][profile - 1] ?? 0;
  const extraCount = Math.max(lengthSetting.extra_count, requiredAfterCount);
  const remainingCount = extraCount - requiredAfterCount;
  const stageCounts: Record<DetailStage, number> = {
    before: Math.ceil(remainingCount / 3),
    working: Math.ceil((remainingCount - Math.ceil(remainingCount / 3)) / 2),
    after: requiredAfterCount,
    resolution: 0,
  };
  stageCounts.resolution = extraCount - stageCounts.before - stageCounts.working - stageCounts.after;
  const details = {} as Record<DetailStage, StorySentenceDraft[]>;
  for (const stage of Object.keys(DETAILS) as DetailStage[]) {
    details[stage] = shuffled(random, DETAILS[stage])
      .slice(0, Math.max(0, stageCounts[stage]))
      .map((text) => ({ stage: `detail_${stage}`, text: substitute(text, values) }));
  }

  return [
    core[0]!,
    ...details.before,
    core[1]!,
    core[2]!,
    ...details.working,
    core[3]!,
    core[4]!,
    core[5]!,
    core[6]!,
    ...details.after,
    core[7]!,
    ...details.resolution,
    core[8]!,
    core[9]!,
  ];
}

function buildQuestionContent({ scenario, trait }: {
  readonly scenario: ClueScenario;
  readonly trait: ClueTrait;
}): QuestionContent {
  const traitLength = Array.from(trait.term).length;
  return {
    trait: {
      prompt: `${scenario.protagonist}は、|どのような|ひとですか。|ぶんしょうから|${traitLength}もじで|かきぬきましょう。`,
      answer: trait.term,
      acceptableAnswers: [trait.term],
      evidenceRole: "trait",
      scoringElements: [{ element_id: "exact_extract", points: 1, description: `${trait.term}を過不足なく抜き出す` }],
      disqualifyingAnswers: ["本文にない性格語"],
      points: 1,
    },
    explicitEmotion: {
      prompt: `{{${scenario.location}}}で|しらべはじめたとき、|${scenario.protagonist}は|どのような|{{feeling}}でしたか。|えらびましょう。`,
      answer: `{{${scenario.location}}}で、|なにが|わかるのか|たのしみで、|わくわくしている。`,
      acceptableAnswers: ["なにがわかるのかたのしみで、わくわくしている。"],
      choices: [
        { text: "なにが|わかるのか|たのしみで、|わくわくしている。", correct: true },
        { text: "なにも|みつからないと|おもい、|がっかりしている。", correct: false },
        { text: "はやく|おわりたいと|おもい、|つまらなく|かんじている。", correct: false },
      ],
      evidenceRoles: ["explicit_emotion"],
      primaryConstruct: "C2_INTERPRET_EXPLICIT_EMOTION",
      secondaryDemands: ["場面と明示心情の対応", "選択肢比較"],
      requiredInferenceSteps: 0,
      scoringElements: [{ element_id: "correct_choice", points: 1, description: "明示された心情と一致する選択肢を選ぶ" }],
      disqualifyingAnswers: ["本文の別場面だけに対応する選択肢"],
      points: 1,
      evidenceFragments: ["なにがわかるのかたのしみで、わくわくしました"],
      correctChoiceText: "なにがわかるのかたのしみで、わくわくしている。",
    },
    fact: {
      prompt: `${scenario.protagonist}は、|みつけたことを|たしかめるために、|なにを|することにしましたか。|ぶんしょうから|かきぬきましょう。`,
      answer: scenario.decision,
      acceptableAnswers: [removePhraseMarkers(scenario.decision)],
      evidenceRole: "fact",
      scoringElements: [{ element_id: "exact_fact", points: 1, description: `${removePhraseMarkers(scenario.decision)}を過不足なく抜き出す` }],
      disqualifyingAnswers: ["発見した結果だけを書いた答え"],
      points: 1,
    },
    emotionOpen: {
      prompt: `${scenario.friend}に|ちいさく|うなずいたとき、|${scenario.protagonist}は|どのような|{{feeling}}でしたか。|りゆうと|いっしょに|かきましょう。`,
      answer: "しるしの|ひみつが|わかって、|うれしい|{{feeling}}。",
      acceptableAnswers: ["しるしがつながってうれしい", "ひみつがわかってよろこんでいる"],
      evidenceRole: "inference_situation",
      evidenceRoles: ["inference_situation", "inference_reaction"],
      evidenceFragments: [scenario.matchFragment, "ちいさくうなずきました"],
      answerFragmentsAny: ["うれしい", "わくわく", "よろこん"],
      scoringElements: [
        { element_id: "situation", points: 1, description: "手がかりがつながって、ひみつがわかった状況を捉える" },
        { element_id: "emotion", points: 1, description: "うなずく反応と合う、うれしい・わくわくした・喜んだなどの心情を示す" },
      ],
      disqualifyingAnswers: ["かなしいなど根拠と反対の心情だけを書き、本文根拠を示さない"],
      points: 2,
    },
    causeResult: {
      prompt: `なぜ、|${scenario.protagonist}は|みつけたことを|たしかめようと|おもったのですか。|えらびましょう。`,
      answer: scenario.clue,
      acceptableAnswers: [removePhraseMarkers(scenario.clue)],
      choices: [
        { text: `${scenario.clue}から。`, correct: true },
        { text: `${scenario.friend}が|かえろうと|いったから。`, correct: false },
        { text: "しらべるものが|なくなったから。", correct: false },
      ],
      evidenceRoles: ["clue", "fact"],
      evidenceFragments: [removePhraseMarkers(scenario.clue), removePhraseMarkers(scenario.decision)],
      correctChoiceText: `${removePhraseMarkers(scenario.clue)}から。`,
      primaryConstruct: "C6_CONNECT_CAUSE_RESULT",
      secondaryDemands: ["原因と行動の対応", "選択肢比較"],
      requiredInferenceSteps: 1,
      scoringElements: [{ element_id: "cause", points: 1, description: "確かめる行動につながった手がかりを捉える" }],
      disqualifyingAnswers: ["本文にない原因を選ぶ"],
      points: 1,
    },
    eventSequence: {
      prompt: `てがかりを|みつけたあと、|${scenario.protagonist}は|つぎに|なにをしましたか。|えらびましょう。`,
      answer: scenario.decision,
      acceptableAnswers: [removePhraseMarkers(scenario.decision)],
      choices: [
        { text: `${scenario.decision}。`, correct: true },
        { text: "そのまま|かえりました。", correct: false },
        { text: `${scenario.friend}に|ぜんぶ|まかせました。`, correct: false },
      ],
      evidenceRoles: ["clue", "fact"],
      evidenceFragments: [removePhraseMarkers(scenario.clue), removePhraseMarkers(scenario.decision)],
      correctChoiceText: `${removePhraseMarkers(scenario.decision)}。`,
      primaryConstruct: "C7_INTEGRATE_CONTEXT",
      secondaryDemands: ["出来事の順序", "前後文脈の統合"],
      requiredInferenceSteps: 1,
      scoringElements: [{ element_id: "next_action", points: 1, description: "手がかりの後に選んだ行動を捉える" }],
      disqualifyingAnswers: ["別場面の行動を選ぶ"],
      points: 1,
    },
    sceneEmotion: {
      prompt: `ひみつが|わかったあと、|${scenario.protagonist}は|どのような|{{feeling}}でしたか。|えらびましょう。`,
      answer: "ひみつが|わかって、|うれしい|{{feeling}}。",
      acceptableAnswers: ["うれしい", "わくわく", "よろこんでいる"],
      choices: [
        { text: "ひみつが|わかって、|うれしい。", correct: true },
        { text: "なにも|わからず、|かなしい。", correct: false },
        { text: "しらべるのが|いやで、|おこっている。", correct: false },
      ],
      evidenceRoles: ["resolution", "closing"],
      evidenceFragments: [removePhraseMarkers(scenario.discovery), "ふたりはわらいました"],
      correctChoiceText: "ひみつがわかって、うれしい。",
      primaryConstruct: "C3_INFER_EMOTION",
      secondaryDemands: ["結果と反応からの心情推論", "選択肢比較"],
      requiredInferenceSteps: 1,
      scoringElements: [{ element_id: "scene_emotion", points: 1, description: "状況と反応に合う心情を選ぶ" }],
      disqualifyingAnswers: ["根拠と反対の心情を選ぶ"],
      points: 1,
    },
    resolution: {
      prompt: `さいごに、|なにが|わかりましたか。|ぶんしょうから|かきぬきましょう。`,
      answer: scenario.discovery,
      acceptableAnswers: [removePhraseMarkers(scenario.discovery)],
      evidenceRole: "resolution",
      scoringElements: [{ element_id: "result", points: 1, description: "手がかりから分かった結果を過不足なく抜き出す" }],
      disqualifyingAnswers: ["調べ始めたときの予想だけを書いた答え"],
      points: 1,
    },
  };
}

export const storyClueDiscovery4qBlueprint = Object.freeze({
  id: STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
  storyStructureId: STORY_CLUE_DISCOVERY_STRUCTURE_ID,
  textType: "narrative",
  genre: "物語文",
  anchorIds: Object.freeze([
    "ANCHOR-STORY-Q06" as AnchorId,
    "ANCHOR-RUBY-Q12" as AnchorId,
    "ANCHOR-RUBY-Q18" as AnchorId,
  ]),
  evidenceRoles: Object.freeze([
    "trait",
    "explicit_emotion",
    "clue",
    "fact",
    "inference_situation",
    "inference_reaction",
    "resolution",
    "closing",
  ]),
  createScenario({ storyPlan, topic, random }: ScenarioInput) {
    if (storyPlan) throw new RangeError(`${STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID} does not accept story-plan.v1`);
    return chooseScenario(random, topic);
  },
  pickTrait(random: () => number) {
    return pick(random, TRAITS);
  },
  buildTitle({ scenario }: { readonly scenario: ClueScenario }) {
    return scenario.title;
  },
  buildStorySentences,
  buildQuestionContent,
  buildStoryMetadata({ scenario, trait }: {
    readonly scenario: ClueScenario;
    readonly trait: ClueTrait;
    readonly storyPlan: StoryPlanV1 | null;
  }) {
    return {
      genre: "物語文",
      category: scenario.category,
      setting_lexeme_id: scenario.location as LexemeId,
      character_structure: "two_person",
      protagonist: {
        name: scenario.protagonist,
        trait: trait.term,
        goal: `${removePhraseMarkers(scenario.subject)}のひみつをみつける`,
      },
      supporting_character: scenario.friend,
      late_arriving_character: null,
      event: {
        problem: null,
        clue: removePhraseMarkers(scenario.clue),
        resolution: removePhraseMarkers(scenario.discovery),
        emotion_before: "わくわく",
        emotion_after: "うれしい",
      },
    };
  },
  templateVersion(_input: { readonly storyPlan: StoryPlanV1 | null }) {
    return "deterministic-clue-discovery-template.v0.1";
  },
  runMachineChecks: runQuestionSetChecks,
} satisfies Blueprint<ClueScenario, ClueTrait>);
