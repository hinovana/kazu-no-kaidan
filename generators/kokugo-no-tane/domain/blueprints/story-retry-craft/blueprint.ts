import {
  expectedCategoryForTopic,
  parseStoryPlan,
} from "../../schemas/story-plan-v1.ts";
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

export const STORY_STANDARD_4Q_BLUEPRINT_ID = "story-standard-4q.v1" as BlueprintId;
export const STORY_RETRY_CRAFT_STRUCTURE_ID = "story-retry-craft.v1" as StoryStructureId;

interface RetryScenario {
  readonly category: string;
  readonly topicWords: readonly string[];
  readonly location: string;
  readonly protagonist: string;
  readonly protagonistLabel?: string;
  readonly friend: string;
  readonly friendLabel?: string;
  readonly object: string;
  readonly action: string;
  readonly problem: string;
  readonly decision: string;
  readonly resolution: string;
  readonly source?: "ai_story_plan";
  readonly storyPlan?: StoryPlanV1;
}

interface RetryTrait extends BlueprintTrait {
  readonly sentence: string;
  readonly expectation: (name: string, action: string) => string;
}

type DetailStage = "before" | "working" | "after" | "resolution";

const SCENARIOS = Object.freeze([
  {
    category: "家庭",
    topicWords: ["家", "家庭", "おうち"],
    location: "home",
    protagonist: "まな",
    friend: "たいち",
    object: "まどべに|かざる|かみのはな",
    action: "はなびらを|かさねよう",
    problem: "はなびらを|ひとつ|うらがえしに|はってしまいました",
    decision: "かたちを|ならべてから|はること",
    resolution: "こんどは、|はなびらが|きれいに|ひらきました",
  },
  {
    category: "学校",
    topicWords: ["学校", "教室", "工作"],
    location: "classroom",
    protagonist: "りく",
    friend: "みお",
    object: "かみのとり",
    action: "はねを|おろう",
    problem: "はねのむきを|まちがえてしまいました",
    decision: "おりめを|ひとつずつ|たしかめること",
    resolution: "こんどは、|はねが|きれいに|そろいました",
  },
  {
    category: "自然",
    topicWords: ["公園", "自然", "花", "生き物"],
    location: "park",
    protagonist: "さき",
    friend: "なお",
    object: "はなのしるし",
    action: "いろを|ぬろう",
    problem: "あかいしるしを|ちがうばしょに|つけてしまいました",
    decision: "みつけたじゅんに|ゆびで|たどること",
    resolution: "こんどは、|しるしを|ただしいばしょに|つけられました",
  },
  {
    category: "本",
    topicWords: ["本", "図書館", "読書"],
    location: "library",
    protagonist: "そうた",
    friend: "ゆい",
    object: "ほんの|しょうかいカード",
    action: "えを|かこう",
    problem: "だいじなことばを|ひとつ|かきわすれてしまいました",
    decision: "ほんを|さいしょから|もういちど|みること",
    resolution: "こんどは、|だいじなことばも|カードに|かけました",
  },
  {
    category: "町",
    topicWords: ["町", "広場", "案内"],
    location: "square",
    protagonist: "あおい",
    friend: "けん",
    object: "みちあんないの|ふだ",
    action: "やじるしを|かこう",
    problem: "やじるしを|はんたいに|かいてしまいました",
    decision: "あるくむきを|たしかめてから|かくこと",
    resolution: "こんどは、|やじるしが|ただしいみちを|しめしました",
  },
  {
    category: "遊び",
    topicWords: ["遊び", "外", "友だち"],
    location: "park",
    protagonist: "はる",
    friend: "れん",
    object: "かぜで|まわる|かざり",
    action: "ひもを|むすぼう",
    problem: "ひもを|みじかく|きってしまいました",
    decision: "ながさを|ならべてから|きること",
    resolution: "こんどは、|かざりが|かぜで|くるくる|まわりました",
  },
  {
    category: "係活動",
    topicWords: ["係", "学校", "準備"],
    location: "school",
    protagonist: "のぞみ",
    friend: "かい",
    object: "おしらせの|ふだ",
    action: "もじを|ならべよう",
    problem: "ふたつのもじを|ぎゃくに|ならべてしまいました",
    decision: "こえに|だして|よんでから|ならべること",
    resolution: "こんどは、|おしらせが|すぐに|よめるように|なりました",
  },
  {
    category: "動物",
    topicWords: ["動物", "こりす", "うさぎ", "森"],
    location: "forest",
    protagonist: "リリ",
    protagonistLabel: "こりすの|リリ",
    friend: "モモ",
    friendLabel: "うさぎの|モモ",
    object: "きのみを|かざる|かご",
    action: "きのみを|ならべよう",
    problem: "あかいきのみを|ちがうだんに|おいてしまいました",
    decision: "かごのしたから|じゅんに|たしかめること",
    resolution: "こんどは、|きのみが|きれいなしまもように|なりました",
  },
]);

const TRAITS = Object.freeze([
  {
    term: "あわてんぼう",
    sentence: "あわてんぼうな|ひとです",
    expectation: (name: string, action: string) => `${name}は、|いそいで|${action}と|しました。`,
  },
  {
    term: "まけずぎらい",
    sentence: "まけずぎらいな|ひとです",
    expectation: (name: string, action: string) => `${name}は、|だれよりも|はやく|${action}と|しました。`,
  },
  {
    term: "こうきしんがつよい",
    sentence: "こうきしんがつよい|ひとです",
    expectation: (name: string, action: string) => `${name}は、|できあがりを|みたくて、|${action}と|しました。`,
  },
]);

const DETAILS = Object.freeze({
  before: [
    "あたりは、|やわらかいひかりに|つつまれていました。",
    "つかうどうぐが、|きれいに|ならんでいました。",
    "まわりから、|たのしそうなこえが|きこえてきました。",
    "ふたりは、|はじめにすることを|いっしょに|たしかめました。",
    "{{preparation}}のじかんは、|まだ|じゅうぶんに|のこっていました。",
    "となりでは、|べつのふたりも|しずかに|てを|うごかしていました。",
  ],
  working: [
    "しゅじんこうは、|どうぐを|てばやく|ならべました。",
    "ともだちは、|ゆっくりでいいよと|こえを|かけました。",
    "しゅじんこうは、|うなずきながらも|てを|いそがせました。",
    "できあがったところを|そうぞうして、|にこりと|しました。",
    "とちゅうで|いちど、|じゅんばんを|みなおすじかんも|ありました。",
    "ふたりのあいだに、|ちいさなわらいごえが|ひろがりました。",
  ],
  after: [
    "しゅじんこうは、|さっきのてじゅんを|あたまのなかで|たどりました。",
    "ともだちは、|まちがえたところを|ゆびで|そっと|しめしました。",
    "まだつかえるものは、|よこに|わけておきました。",
    "まわりのこえが、|さっきより|とおくに|きこえました。",
    "しゅじんこうは、|ひとついきをして、|だまっていました。",
    "ともだちは、|なおせるところから|やろうと|はなしました。",
  ],
  resolution: [
    "ふたりは、|こんどのじゅんばんを|こえにだして|たしかめました。",
    "しゅじんこうのては、|さっきより|ゆっくりと|うごきました。",
    "ともだちは、|すすんだところを|みて|おおきく|うなずきました。",
    "しゅじんこうは、|あたらしいやりかたを|ていねいに|つづけました。",
    "ふたりは、|さいごまで|しずかに|てを|うごかしました。",
    "ふたりで、|さいごまで|いっしょに|たしかめました。",
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

function chooseScenario(random: () => number, topic: string | undefined): RetryScenario {
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

function scenarioFromStoryPlan(storyPlan: unknown, topic: string | undefined): RetryScenario {
  const plan = parseStoryPlan(storyPlan);
  const expectedCategory = expectedCategoryForTopic(topic);
  if (expectedCategory && plan.category !== expectedCategory) {
    throw new RangeError(`story plan category must be ${expectedCategory} for topic ${topic}`);
  }
  const locationByType: Readonly<Record<StoryPlanV1["setting"]["type"], string>> = {
    school: "school",
    home: "home",
    park: "park",
    library: "library",
    public_space: "square",
    forest: "forest",
  };
  return {
    category: plan.category,
    topicWords: [],
    location: locationByType[plan.setting.type] ?? "square",
    protagonist: plan.protagonist.name,
    friend: plan.supporting_character.name,
    object: plan.title_concept,
    action: plan.event.action,
    problem: plan.event.problem,
    decision: plan.event.decision,
    resolution: plan.event.resolution,
    source: "ai_story_plan",
    storyPlan: plan,
  };
}

function buildStorySentences({
  scenario,
  trait,
  profile,
  lengthSetting,
  random,
}: {
  readonly scenario: RetryScenario;
  readonly trait: RetryTrait;
  readonly profile: GenerationProfile;
  readonly lengthSetting: LengthSetting;
  readonly random: () => number;
}): StorySentenceDraft[] {
  const values = { protagonist: scenario.protagonist, friend: scenario.friend };
  const protagonistIntro = scenario.protagonistLabel ?? scenario.protagonist;
  const friendIntro = scenario.friendLabel ?? scenario.friend;
  const core = [
    { stage: "opening", text: `{{${scenario.location}}}で、|${protagonistIntro}と|${friendIntro}は、|${scenario.object}を|つくることになりました。` },
    { stage: "trait", text: `${scenario.protagonist}は、|${trait.sentence}。` },
    { stage: "expectation", text: trait.expectation(scenario.protagonist, scenario.action) },
    { stage: "explicit_emotion", text: "じょうずに|できそうだと|おもい、|うれしくなりました。" },
    { stage: "problem", text: `ところが、|そのまま|いそいだため、|${scenario.problem}。` },
    { stage: "fact", text: `${scenario.protagonist}は、|${scenario.decision}に|しました。` },
    { stage: "inference_situation", text: `${scenario.protagonist}は、|まちがえたところを|${scenario.friend}に|みられました。` },
    { stage: "inference_reaction", text: "みられたくなくて、|したを|みました。" },
    { stage: "resolution", text: scenario.resolution + "。" },
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
  readonly scenario: RetryScenario;
  readonly trait: RetryTrait;
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
      prompt: `{{${scenario.location}}}で|つくりはじめたとき、|${scenario.protagonist}は|どのような|{{feeling}}でしたか。|えらびましょう。`,
      answer: `{{${scenario.location}}}で、|じょうずに|できそうで、|うれしい。`,
      acceptableAnswers: ["じょうずにできそうで、うれしい。"],
      choices: [
        { text: "じょうずに|できそうで、|うれしい。", correct: true },
        { text: "うまく|できないと|おもい、|かなしい。", correct: false },
        { text: "はやく|かえりたいと|おもい、|つまらない。", correct: false },
      ],
      evidenceRoles: ["explicit_emotion"],
      primaryConstruct: "C2_INTERPRET_EXPLICIT_EMOTION",
      secondaryDemands: ["場面と明示心情の対応", "選択肢比較"],
      requiredInferenceSteps: 0,
      scoringElements: [{ element_id: "correct_choice", points: 1, description: "明示された心情と一致する選択肢を選ぶ" }],
      disqualifyingAnswers: ["本文の別場面だけに対応する選択肢"],
      points: 1,
      evidenceFragments: ["じょうずにできそうだとおもい、うれしくなりました"],
      correctChoiceText: "じょうずにできそうで、うれしい。",
    },
    fact: {
      prompt: `${scenario.protagonist}は、|やりなおすために、|なにを|することにしましたか。|ぶんしょうから|かきぬきましょう。`,
      answer: scenario.decision,
      acceptableAnswers: [removePhraseMarkers(scenario.decision)],
      evidenceRole: "fact",
      scoringElements: [{ element_id: "exact_fact", points: 1, description: `${removePhraseMarkers(scenario.decision)}を過不足なく抜き出す` }],
      disqualifyingAnswers: ["出来事の結果だけを書いた答え"],
      points: 1,
    },
    emotionOpen: {
      prompt: `したを|みたとき、|${scenario.protagonist}は|どのような|{{feeling}}でしたか。|りゆうと|いっしょに|かきましょう。`,
      answer: `まちがえたところを|${scenario.friend}に|みられて、|はずかしい|{{feeling}}。`,
      acceptableAnswers: ["まちがいを見られてはずかしい", "しっぱいを見られてこまった"],
      evidenceRole: "inference_situation",
      evidenceRoles: ["inference_situation", "inference_reaction"],
      evidenceFragments: ["まちがえたところ", "みられたくなくて"],
      answerFragmentsAny: ["はずかしい", "きまずい", "こまった"],
      scoringElements: [
        { element_id: "situation", points: 1, description: "まちがいを友だちに見られた状況を捉える" },
        { element_id: "emotion", points: 1, description: "見られたくない気持ちと合う、はずかしい・きまずい・困ったなどの心情を示す" },
      ],
      disqualifyingAnswers: ["うれしいなど根拠と反対の心情だけを書き、本文根拠を示さない"],
      points: 2,
    },
    causeResult: {
      prompt: "なぜ、|うまく|いかなかったのですか。|えらびましょう。",
      answer: "そのまま|いそいだから。",
      acceptableAnswers: ["そのままいそいだから"],
      choices: [
        { text: "そのまま|いそいだから。", correct: true },
        { text: `${scenario.friend}が|さきに|おわったから。`, correct: false },
        { text: "つくるものが|なくなったから。", correct: false },
      ],
      evidenceRoles: ["problem"],
      evidenceFragments: ["そのままいそいだため"],
      correctChoiceText: "そのままいそいだから。",
      primaryConstruct: "C6_CONNECT_CAUSE_RESULT",
      secondaryDemands: ["原因と結果の対応", "選択肢比較"],
      requiredInferenceSteps: 1,
      scoringElements: [{ element_id: "cause", points: 1, description: "失敗の原因を本文から捉える" }],
      disqualifyingAnswers: ["本文にない原因を選ぶ"],
      points: 1,
    },
    eventSequence: {
      prompt: `うまく|いかなかったあと、|${scenario.protagonist}は|つぎに|なにをしましたか。|えらびましょう。`,
      answer: scenario.decision,
      acceptableAnswers: [removePhraseMarkers(scenario.decision)],
      choices: [
        { text: `${scenario.decision}。`, correct: true },
        { text: "そのまま|かえりました。", correct: false },
        { text: `${scenario.friend}に|ぜんぶ|まかせました。`, correct: false },
      ],
      evidenceRoles: ["problem", "fact"],
      evidenceFragments: ["そのままいそいだため", removePhraseMarkers(scenario.decision)],
      correctChoiceText: `${removePhraseMarkers(scenario.decision)}。`,
      primaryConstruct: "C7_INTEGRATE_CONTEXT",
      secondaryDemands: ["出来事の順序", "前後文脈の統合"],
      requiredInferenceSteps: 1,
      scoringElements: [{ element_id: "next_action", points: 1, description: "失敗後に選んだ行動を捉える" }],
      disqualifyingAnswers: ["別場面の行動を選ぶ"],
      points: 1,
    },
    sceneEmotion: {
      prompt: `やりなおしたあと、|${scenario.protagonist}は|どのような|{{feeling}}でしたか。|えらびましょう。`,
      answer: "うまく|できて、|うれしい|{{feeling}}。",
      acceptableAnswers: ["うれしい", "ほっとした", "よろこんでいる"],
      choices: [
        { text: "うまく|できて、|うれしい。", correct: true },
        { text: "また|まちがえて、|かなしい。", correct: false },
        { text: "つくるのが|いやで、|おこっている。", correct: false },
      ],
      evidenceRoles: ["resolution", "closing"],
      evidenceFragments: [removePhraseMarkers(scenario.resolution), "ふたりはわらいました"],
      correctChoiceText: "うまくできて、うれしい。",
      primaryConstruct: "C3_INFER_EMOTION",
      secondaryDemands: ["結果と反応からの心情推論", "選択肢比較"],
      requiredInferenceSteps: 1,
      scoringElements: [{ element_id: "scene_emotion", points: 1, description: "やり直した結果と反応に合う心情を選ぶ" }],
      disqualifyingAnswers: ["根拠と反対の心情を選ぶ"],
      points: 1,
    },
    resolution: {
      prompt: `やりなおしたあと、|どうなりましたか。|ぶんしょうから|かきぬきましょう。`,
      answer: scenario.resolution,
      acceptableAnswers: [removePhraseMarkers(scenario.resolution)],
      evidenceRole: "resolution",
      scoringElements: [{ element_id: "result", points: 1, description: "やり直した結果を過不足なく抜き出す" }],
      disqualifyingAnswers: ["やり直す前の出来事だけを書いた答え"],
      points: 1,
    },
  };
}

export const storyStandard4qBlueprint = Object.freeze({
  id: STORY_STANDARD_4Q_BLUEPRINT_ID,
  storyStructureId: STORY_RETRY_CRAFT_STRUCTURE_ID,
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
    "problem",
    "fact",
    "inference_situation",
    "inference_reaction",
    "resolution",
    "closing",
  ]),
  createScenario({ storyPlan, topic, random }: ScenarioInput) {
    return storyPlan ? scenarioFromStoryPlan(storyPlan, topic) : chooseScenario(random, topic);
  },
  pickTrait(random: () => number) {
    return pick(random, TRAITS);
  },
  buildTitle({ scenario }: { readonly scenario: RetryScenario }) {
    return `{{${scenario.location}}}でのやりなおし`;
  },
  buildStorySentences,
  buildQuestionContent,
  buildStoryMetadata({ scenario, trait, storyPlan }: {
    readonly scenario: RetryScenario;
    readonly trait: RetryTrait;
    readonly storyPlan: StoryPlanV1 | null;
  }) {
    return {
      genre: "物語文",
      category: scenario.category,
      setting_lexeme_id: scenario.location as LexemeId,
      protagonist: {
        name: scenario.protagonist,
        trait: trait.term,
        goal: storyPlan?.goal ?? `${removePhraseMarkers(scenario.object)}をしあげる`,
      },
      supporting_character: scenario.friend,
      event: {
        problem: removePhraseMarkers(scenario.problem),
        resolution: removePhraseMarkers(scenario.resolution),
        emotion_before: storyPlan?.emotion.before ?? null,
        emotion_after: storyPlan?.emotion.after ?? null,
      },
    };
  },
  templateVersion({ storyPlan }: { readonly storyPlan: StoryPlanV1 | null }) {
    return storyPlan ? "ai-story-plan-adapter.v0.1" : "deterministic-story-template.v0.3";
  },
  runMachineChecks: runQuestionSetChecks,
} satisfies Blueprint<RetryScenario, RetryTrait>);
