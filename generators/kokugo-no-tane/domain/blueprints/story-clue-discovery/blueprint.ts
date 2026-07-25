import { runQuestionSetChecks } from "../standard-four-question-checks.ts";
import {
  selectStoryExpansions,
  type StoryExpansionPack,
} from "../story-expansions.ts";
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
  readonly observation: string;
  readonly hypothesis: string;
  readonly clue: string;
  readonly decision: string;
  readonly comparisonTarget: string;
  readonly comparisonResult: string;
  readonly matchFragment: string;
  readonly discovery: string;
}

interface ClueTrait extends BlueprintTrait {
  readonly sentence: string;
  readonly attention: (name: string) => string;
}

const SCENARIOS = Object.freeze([
  {
    category: "家庭",
    topicWords: ["家", "家庭", "おうち"],
    location: "home",
    protagonist: "まな",
    friend: "たいち",
    title: "{{home}}のひかりのしるし",
    subject: "まどべに|うつる|ひかりのうごき",
    observation: "ひかりのかたちが、|まどのかざりに|にている",
    hypothesis: "ひかりは、|まどのかざりを|とおっているのかもしれない",
    clue: "まるいひかりが、|かべのうえを|すこしずつ|うごきました",
    decision: "ひかりのばしょを|じゅんに|しるしにすること",
    comparisonTarget: "ならべたしるしと|まどのかざり",
    comparisonResult: "おなじかたちだと|わかり",
    matchFragment: "ならべたしるしとまどのかざりをみくらべたけっか、おなじかたちだとわかり",
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
    observation: "ひくいおとがするばしょには、|つくえのしたに|ものがある",
    hypothesis: "つくえのしたのものが、|おとのちがいを|つくっているのかもしれない",
    clue: "おなじつくえでも、|ばしょによって|おとが|かわりました",
    decision: "たたくばしょを|ひとつずつ|かえて|くらべること",
    comparisonTarget: "おとのちがいと|つくえのした",
    comparisonResult: "ひくいおとのばしょにだけ|ものが|はいっていると|わかり",
    matchFragment: "おとのちがいとつくえのしたをみくらべたけっか、ひくいおとのばしょにだけものがはいっているとわかり",
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
    observation: "にたはっぱが、|おなじむきに|ならんでいる",
    hypothesis: "おなじきのはっぱが、|かぜで|はこばれたのかもしれない",
    clue: "にたはっぱが、|みちのはしに|つづいていました",
    decision: "はっぱを|おちているじゅんに|ならべて|くらべること",
    comparisonTarget: "ならべたはっぱと|みちのはしのはっぱ",
    comparisonResult: "おなじきのしたへ|つづいていると|わかり",
    matchFragment: "ならべたはっぱとみちのはしのはっぱをみくらべたけっか、おなじきのしたへつづいているとわかり",
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
    observation: "しるしのむきが、|ひろばのあんないへ|むいている",
    hypothesis: "しるしは、|あんないのばしょを|おしえているのかもしれない",
    clue: "おなじかたちのしるしが、|すこしずつ|はなれて|つづいていました",
    decision: "しるしのむきを|ひとつずつ|たどること",
    comparisonTarget: "さいごのしるしと|ひろばのあんないのえ",
    comparisonResult: "おなじかたちだと|わかり",
    matchFragment: "さいごのしるしとひろばのあんないのえをみくらべたけっか、おなじかたちだとわかり",
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
    observation: "まるいあとが、|おなじむきに|つづいている",
    hypothesis: "ことりが|あるいたあとかもしれない",
    clue: "まるいあとが、|きのみのそばまで|つづいていました",
    decision: "あしあとを|はなれたところから|めで|たどること",
    comparisonTarget: "あしあとと|ことりのあし",
    comparisonResult: "おなじかたちだと|わかり",
    matchFragment: "あしあととことりのあしをみくらべたけっか、おなじかたちだとわかり",
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

function pick<T>(random: () => number, values: readonly T[]): T {
  const selected = values[Math.floor(random() * values.length)];
  if (selected === undefined) throw new RangeError("cannot pick from an empty content pack");
  return selected;
}

function removePhraseMarkers(text: unknown): string {
  return String(text).replaceAll("|", "");
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

function buildExpansionPack(scenario: ClueScenario): StoryExpansionPack {
  const protagonist = scenario.protagonist;
  const friend = scenario.friend;
  return {
    before: [
      {
        id: "plan_order",
        text: "ふたりは、|どこから|たしかめるか、|じゅんばんを|きめました。",
        narrativeFunction: "decide",
      },
      {
        id: "inspect_subject_again",
        text: `${protagonist}は、|${scenario.subject}を|もういちど|みました。`,
        narrativeFunction: "observe",
      },
      {
        id: "plan_hypothesis_test",
        text: `${friend}は、|よそうを|たしかめるには、|くらべると|よいと|いいました。`,
        narrativeFunction: "decide",
        referenceTargetRole: "hypothesis",
      },
      {
        id: "divide_search_area",
        text: "ふたりは、|みるばしょを|わけて、|しらべることに|しました。",
        narrativeFunction: "decide",
      },
      {
        id: "watch_small_differences",
        text: `${protagonist}は、|ちいさなちがいも|のこさず|みようと|しました。`,
        narrativeFunction: "attempt",
      },
      {
        id: "point_first_observation",
        text: `${friend}は、|はじめに|きがついたところを|ゆびで|しめしました。`,
        narrativeFunction: "observe",
        referenceTargetRole: "observation",
      },
    ],
    working: [
      {
        id: "inspect_near_and_far",
        text: `${protagonist}は、|${scenario.subject}を|ちかくからも|とおくからも|みました。`,
        narrativeFunction: "observe",
      },
      {
        id: "mark_observed_place",
        text: `${friend}は、|きがついたばしょに|ちいさなしるしを|つけました。`,
        narrativeFunction: "observe",
        referenceTargetRole: "observation",
      },
      {
        id: "compare_two_places",
        text: "ふたりは、|ちがうばしょを|ふたつえらび、|かわるところを|くらべました。",
        narrativeFunction: "compare",
      },
      {
        id: "record_order",
        text: `${protagonist}は、|みつけたじゅんばんを|わすれないように|おぼえました。`,
        narrativeFunction: "attempt",
      },
      {
        id: "seek_same_feature",
        text: `${friend}は、|おなじとくちょうが|ほかにも|ないか|さがしました。`,
        narrativeFunction: "attempt",
      },
      {
        id: "return_to_hypothesis",
        text: `${protagonist}は、|よそうと|ちがうところが|ないかも|たしかめました。`,
        narrativeFunction: "compare",
        referenceTargetRole: "hypothesis",
      },
    ],
    between_evidence: [
      {
        id: "recall_hypothesis",
        text: `${protagonist}は、|はじめのよそうを|おもいだしました。`,
        narrativeFunction: "understand",
        referenceTargetRole: "hypothesis",
      },
      {
        id: "trace_clue_again",
        text: `${friend}は、|みつけたてがかりを|もういちど|じゅんに|たどりました。`,
        narrativeFunction: "compare",
        referenceTargetRole: "clue",
      },
      {
        id: "compare_result_again",
        text: "ふたりは、|くらべたけっかを|もういちど|たしかめました。",
        narrativeFunction: "compare",
        referenceTargetRole: "inference_situation",
      },
      {
        id: "friend_waits_for_answer",
        text: `${friend}は、|${protagonist}が|こたえを|みつけるのを|だまって|まちました。`,
        narrativeFunction: "react",
      },
      {
        id: "check_observation_alignment",
        text: `${protagonist}は、|はじめに|きがついたことと、|いまのけっかが|あうか|かんがえました。`,
        narrativeFunction: "compare",
        referenceTargetRole: "observation",
      },
      {
        id: "point_same_answer",
        text: "ふたりのゆびは、|おなじばしょを|さしていました。",
        narrativeFunction: "understand",
        referenceTargetRole: "inference_situation",
      },
    ],
    resolution: [
      {
        id: "explain_discovery",
        text: `${protagonist}は、|わかったことを|${friend}に|じゅんに|せつめいしました。`,
        narrativeFunction: "aftermath",
        referenceTargetRole: "resolution",
      },
      {
        id: "review_search_path",
        text: `${friend}は、|どのてがかりから|わかったのかを|たしかめました。`,
        narrativeFunction: "aftermath",
        referenceTargetRole: "resolution",
      },
      {
        id: "record_discovery",
        text: "ふたりは、|わかったことを|わすれないように|きろくしました。",
        narrativeFunction: "aftermath",
        referenceTargetRole: "resolution",
      },
      {
        id: "compare_hypothesis_and_discovery",
        text: "ふたりは、|はじめのよそうと|わかったことを|くらべました。",
        narrativeFunction: "compare",
        referenceTargetRole: "hypothesis",
      },
      {
        id: "retrace_method",
        text: `${protagonist}は、|しらべたじゅんばんを|さいしょから|ふりかえりました。`,
        narrativeFunction: "aftermath",
        referenceTargetRole: "resolution",
      },
      {
        id: "share_next_method",
        text: `${friend}は、|つぎも|くらべながら|たしかめようと|いいました。`,
        narrativeFunction: "aftermath",
      },
    ],
  };
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
  const protagonistIntro = scenario.protagonistLabel ?? scenario.protagonist;
  const friendIntro = scenario.friendLabel ?? scenario.friend;
  const expansions = selectStoryExpansions({
    pack: buildExpansionPack(scenario),
    profile,
    lengthSetting,
    random,
  });
  const core = {
    opening: {
      stage: "opening",
      text: `{{${scenario.location}}}で、|${protagonistIntro}と|${friendIntro}は、|{{two_people}}で|${scenario.subject}を|しらべていました。`,
      narrativeFunction: "set_scene",
    },
    contextSetup: {
      stage: "context_setup",
      text: "{{two_people}}は、|しらべる|{{place}}を|きめました。",
      narrativeFunction: "decide",
      referenceTargetRole: "opening",
    },
    observation: {
      stage: "observation",
      text: `${scenario.friend}は、|${scenario.observation}と|いいました。`,
      narrativeFunction: "observe",
    },
    hypothesis: {
      stage: "hypothesis",
      text: `${scenario.hypothesis}と、|{{two_people}}は|よそうしました。`,
      narrativeFunction: "hypothesize",
      referenceTargetRole: "observation",
    },
    trait: {
      stage: "trait",
      text: `${scenario.protagonist}は、|${trait.sentence}。`,
      narrativeFunction: "characterize",
    },
    attention: {
      stage: "attention",
      text: trait.attention(scenario.protagonist),
      narrativeFunction: "characterize",
    },
    explicitEmotion: {
      stage: "explicit_emotion",
      text: `{{${scenario.location}}}で、|なにが|わかるのか|たのしみで、|わくわくしました。`,
      narrativeFunction: "react",
    },
    clue: {
      stage: "clue",
      text: `すると、|${scenario.clue}。`,
      narrativeFunction: "observe",
    },
    fact: {
      stage: "fact",
      text: `${scenario.protagonist}は、|${scenario.decision}に|しました。`,
      narrativeFunction: "decide",
      referenceTargetRole: "clue",
    },
    inferenceSituation: {
      stage: "inference_situation",
      text: `{{two_people}}が|${scenario.comparisonTarget}を|みくらべたけっか、|${scenario.comparisonResult}、|${scenario.protagonist}は、|はじめのよそうと|あっていることに|きがつきました。`,
      narrativeFunction: "understand",
      referenceTargetRole: "hypothesis",
    },
    inferenceReaction: {
      stage: "inference_reaction",
      text: `${scenario.protagonist}は、|めを|かがやかせて、|${scenario.friend}に|ちいさく|うなずきました。`,
      narrativeFunction: "react",
      referenceTargetRole: "inference_situation",
    },
    resolution: {
      stage: "resolution",
      text: scenario.discovery + "。",
      narrativeFunction: "resolve",
      referenceTargetRole: "inference_situation",
    },
    closing: {
      stage: "closing",
      text: "その|{{place}}で、|{{two_people}}は|わらいました。",
      narrativeFunction: "aftermath",
      referenceTargetRole: "resolution",
    },
  } satisfies Record<string, StorySentenceDraft>;

  return [
    core.opening,
    core.contextSetup,
    core.observation,
    core.hypothesis,
    ...expansions.before,
    core.trait,
    core.attention,
    ...expansions.working,
    core.explicitEmotion,
    core.clue,
    core.fact,
    core.inferenceSituation,
    ...expansions.between_evidence,
    core.inferenceReaction,
    core.resolution,
    ...expansions.resolution,
    core.closing,
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
      answer: "はじめの|よそうどおりだと|わかって、|うれしい|{{feeling}}。",
      acceptableAnswers: ["予想が当たってうれしい", "正体がわかってよろこんでいる"],
      evidenceRole: "inference_situation",
      evidenceRoles: ["inference_situation", "inference_reaction"],
      evidenceFragments: [scenario.matchFragment, "めをかがやかせて"],
      answerSupports: [
        {
          scoringElementId: "situation",
          evidenceRole: "inference_situation",
          evidenceFragment: scenario.matchFragment,
          answerFragmentsAny: ["よそうどおり", "よそうがあたって", "わかって"],
        },
        {
          scoringElementId: "emotion",
          evidenceRole: "inference_reaction",
          evidenceFragment: "めをかがやかせて",
          answerFragmentsAny: ["うれしい", "よろこん"],
        },
      ],
      scoringElements: [
        { element_id: "situation", points: 1, description: "手がかりを比べ、はじめの予想どおりだと分かった状況を捉える" },
        { element_id: "emotion", points: 1, description: "目を輝かせてうなずく反応に合う、うれしい・喜んだなどの心情を示す" },
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
      evidenceFragments: [removePhraseMarkers(scenario.discovery), "二人はわらいました"],
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
    return "deterministic-clue-discovery-template.v0.3";
  },
  runMachineChecks: runQuestionSetChecks,
} satisfies Blueprint<ClueScenario, ClueTrait>);
