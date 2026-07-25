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
import type { MachineCheck, WorksheetCheckInput } from "../../types/worksheet.js";

export const STORY_LATE_ARRIVAL_4Q_BLUEPRINT_ID = "story-late-arrival-4q.v1" as BlueprintId;
export const STORY_LATE_ARRIVAL_STRUCTURE_ID = "story-late-arrival.v1" as StoryStructureId;

interface LateArrivalScenario {
  readonly category: string;
  readonly topicWords: readonly string[];
  readonly location: string;
  readonly protagonist: string;
  readonly protagonistLabel?: string;
  readonly friend: string;
  readonly friendLabel?: string;
  readonly lateEntrant: string;
  readonly lateEntrantLabel?: string;
  readonly title: string;
  readonly task: string;
  readonly problem: string;
  readonly intervention: string;
  readonly interventionReason: string;
  readonly decision: string;
  readonly resolution: string;
}

interface LateArrivalTrait extends BlueprintTrait {
  readonly sentence: string;
  readonly expectation: (name: string) => string;
}

const SCENARIOS = Object.freeze([
  {
    category: "家庭",
    topicWords: ["家", "家庭", "おうち"],
    location: "home",
    protagonist: "まな",
    friend: "たいち",
    lateEntrant: "ゆう",
    title: "{{home}}でそろったはなびら",
    task: "かみのはなを|おなじおおきさで|つくっていました",
    problem: "はなびらの|おおきさが|ばらばらに|なってしまいました",
    intervention: "おなじかたの|かみを|したに|おきました",
    interventionReason: "おなじかたの|かみを|したに|おいて",
    decision: "かたのせんに|そって|はなびらを|きること",
    resolution: "はなびらの|おおきさが|きれいに|そろいました",
  },
  {
    category: "学校",
    topicWords: ["学校", "教室", "係", "準備"],
    location: "school",
    protagonist: "りく",
    friend: "みお",
    lateEntrant: "さな",
    title: "{{school}}のおしらせづくり",
    task: "おしらせの|ふだへ|もじを|ならべていました",
    problem: "ふたつのもじの|じゅんばんが|わからなくなりました",
    intervention: "ふだのことばを|こえにだして|よみました",
    interventionReason: "ふだのことばを|こえにだして|よんで",
    decision: "きこえたじゅんに|もじを|ならべること",
    resolution: "おしらせが|すぐに|よめるように|なりました",
  },
  {
    category: "自然",
    topicWords: ["公園", "自然", "葉", "花"],
    location: "park",
    protagonist: "さき",
    friend: "なお",
    lateEntrant: "ゆうと",
    title: "{{park}}のはっぱのしるし",
    task: "おちばを|きのしゅるいごとに|わけていました",
    problem: "にたはっぱが|どのきのものか|わからなくなりました",
    intervention: "きのみきの|もようを|ゆびで|しめしました",
    interventionReason: "きのみきの|もようを|ゆびで|しめして",
    decision: "はっぱと|みきのもようを|くらべること",
    resolution: "おちばを|きのしゅるいごとに|わけられました",
  },
  {
    category: "町",
    topicWords: ["町", "広場", "案内"],
    location: "square",
    protagonist: "あおい",
    friend: "けん",
    lateEntrant: "ほのか",
    title: "{{square}}のやじるし",
    task: "みちあんないの|ふだへ|やじるしを|かいていました",
    problem: "まがりかどの|むきが|わからなくなりました",
    intervention: "あるいてきたみちを|ゆびで|たどりました",
    interventionReason: "あるいてきたみちを|ゆびで|たどって",
    decision: "ひろばから|みえるむきを|たしかめること",
    resolution: "やじるしが|ただしいみちを|しめしました",
  },
  {
    category: "動物",
    topicWords: ["動物", "こりす", "うさぎ", "森"],
    location: "forest",
    protagonist: "リリ",
    protagonistLabel: "こりすの|リリ",
    friend: "モモ",
    friendLabel: "うさぎの|モモ",
    lateEntrant: "ピピ",
    lateEntrantLabel: "ことりの|ピピ",
    title: "{{forest}}のきのみのかご",
    task: "きのみを|いろごとに|かごへ|ならべていました",
    problem: "にたいろの|きのみが|まざってしまいました",
    intervention: "きのみを|あかるいばしょへ|うつしました",
    interventionReason: "きのみを|あかるいばしょへ|うつして",
    decision: "ひかりのしたで|いろを|くらべること",
    resolution: "きのみを|いろごとに|ならべられました",
  },
]);

const TRAITS = Object.freeze([
  {
    term: "よくきがつく",
    sentence: "よくきがつく|ひとです",
    expectation: (name: string) => `${name}は、|ちいさなちがいも|みのがさないように|みていました。`,
  },
  {
    term: "さいごまでやる",
    sentence: "さいごまでやる|ひとです",
    expectation: (name: string) => `${name}は、|できあがるまで|つづけようと|おもっていました。`,
  },
  {
    term: "しんちょう",
    sentence: "しんちょうな|ひとです",
    expectation: (name: string) => `${name}は、|ひとつずつ|たしかめながら|すすめていました。`,
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

function explicitlyNamesCharacter(text: string, name: string): boolean {
  return new RegExp(`(?:^|[\\s　、。])${name}(?:は|が|と|も|を|に|へ|で|、|。|$)`, "u").test(text);
}

function chooseScenario(random: () => number, topic: string | undefined): LateArrivalScenario {
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

function buildExpansionPack(scenario: LateArrivalScenario): StoryExpansionPack {
  const protagonist = scenario.protagonist;
  const friend = scenario.friend;
  const lateEntrant = scenario.lateEntrant;
  return {
    before: [
      {
        id: "arrange_task_materials",
        text: "ふたりは、|つかうものを|しごとのじゅんに|ならべました。",
        narrativeFunction: "attempt",
        referenceTargetRole: "opening",
      },
      {
        id: "confirm_task_goal",
        text: "ふたりは、|どんなかたちに|しあげるかを|たしかめました。",
        narrativeFunction: "decide",
        referenceTargetRole: "opening",
      },
      {
        id: "divide_task_roles",
        text: `${protagonist}と|${friend}は、|それぞれが|することを|きめました。`,
        narrativeFunction: "decide",
      },
      {
        id: "protagonist_checks_first_item",
        text: `${protagonist}は、|はじめのひとつを|てにとって|よくみました。`,
        narrativeFunction: "observe",
        referenceTargetRole: "opening",
      },
      {
        id: "friend_explains_order",
        text: `${friend}は、|どのじゅんで|すすめるかを|こえにだしました。`,
        narrativeFunction: "decide",
      },
      {
        id: "leave_comparison_space",
        text: "ふたりは、|できたものを|くらべられるように、|よこを|あけました。",
        narrativeFunction: "attempt",
      },
    ],
    working: [
      {
        id: "protagonist_checks_each_step",
        text: `${protagonist}は、|ひとつできるたびに|かたちを|たしかめました。`,
        narrativeFunction: "attempt",
        referenceTargetRole: "expectation",
      },
      {
        id: "friend_says_next_step",
        text: `${friend}は、|つぎにすることを|こえにだして|つたえました。`,
        narrativeFunction: "intervene",
      },
      {
        id: "compare_finished_items",
        text: "ふたりは、|できたものを|となりどうしに|ならべて|くらべました。",
        narrativeFunction: "compare",
        referenceTargetRole: "opening",
      },
      {
        id: "protagonist_marks_key_place",
        text: `${protagonist}は、|だいじなところを|ゆびで|たどりました。`,
        narrativeFunction: "attempt",
      },
      {
        id: "friend_checks_progress",
        text: `${friend}は、|さいしょに|きめたとおりか、|できたところを|みました。`,
        narrativeFunction: "compare",
        referenceTargetRole: "opening",
      },
      {
        id: "both_pause_to_compare",
        text: "ふたりは、|とちゅうで|いちど|てをとめ、|できたところを|みなおしました。",
        narrativeFunction: "compare",
      },
    ],
    between_evidence: [
      {
        id: "late_entrant_explains_help",
        text: `${lateEntrant}は、|どうして|そのやりかたなら|たしかめられるのかを|はなしました。`,
        narrativeFunction: "intervene",
        referenceTargetRole: "intervention",
      },
      {
        id: "friend_notices_effect",
        text: `${friend}は、|さっきより|わかりやすくなったと|いいました。`,
        narrativeFunction: "understand",
        referenceTargetRole: "intervention",
      },
      {
        id: "protagonist_compares_before_after",
        text: `${protagonist}は、|こまっていたときと|いまのやりかたを|くらべました。`,
        narrativeFunction: "compare",
        referenceTargetRole: "problem",
      },
      {
        id: "late_entrant_waits",
        text: `${lateEntrant}は、|${protagonist}が|じぶんで|たしかめるのを|そばで|まちました。`,
        narrativeFunction: "react",
        referenceTargetRole: "fact",
      },
      {
        id: "three_check_method",
        text: "さんにんは、|あたらしいやりかたで|すすめられるかを|いっしょに|たしかめました。",
        narrativeFunction: "attempt",
        referenceTargetRole: "fact",
      },
      {
        id: "protagonist_sees_shared_solution",
        text: `${protagonist}は、|ふたりのことばが|じぶんのこたえに|つながったと|わかりました。`,
        narrativeFunction: "understand",
        referenceTargetRole: "inference_situation",
      },
    ],
    resolution: [
      {
        id: "three_repeat_method",
        text: "さんにんは、|こんどのじゅんばんを|こえにだして|たしかめました。",
        narrativeFunction: "aftermath",
        referenceTargetRole: "fact",
      },
      {
        id: "protagonist_works_calmly",
        text: `${protagonist}のては、|さっきより|おちついて|うごきました。`,
        narrativeFunction: "aftermath",
        referenceTargetRole: "fact",
      },
      {
        id: "friend_points_progress",
        text: `${friend}は、|うまくできたところを|${lateEntrant}に|しめしました。`,
        narrativeFunction: "aftermath",
        referenceTargetRole: "resolution",
      },
      {
        id: "late_entrant_confirms_result",
        text: `${lateEntrant}は、|できあがったところを|みて|おおきく|うなずきました。`,
        narrativeFunction: "aftermath",
        referenceTargetRole: "resolution",
      },
      {
        id: "three_compare_result",
        text: "さんにんは、|さいしょに|めざしたかたちと|できあがりを|くらべました。",
        narrativeFunction: "compare",
        referenceTargetRole: "resolution",
      },
      {
        id: "protagonist_thanks_helpers",
        text: `${protagonist}は、|ふたりが|いっしょに|かんがえてくれたことへ|おれいを|いいました。`,
        narrativeFunction: "aftermath",
        referenceTargetRole: "inference_situation",
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
  readonly scenario: LateArrivalScenario;
  readonly trait: LateArrivalTrait;
  readonly profile: GenerationProfile;
  readonly lengthSetting: LengthSetting;
  readonly random: () => number;
}): StorySentenceDraft[] {
  const protagonistIntro = scenario.protagonistLabel ?? scenario.protagonist;
  const friendIntro = scenario.friendLabel ?? scenario.friend;
  const lateEntrantIntro = scenario.lateEntrantLabel ?? scenario.lateEntrant;
  const expansions = selectStoryExpansions({
    pack: buildExpansionPack(scenario),
    profile,
    lengthSetting,
    random,
  });
  const core = {
    opening: {
      stage: "opening",
      text: `{{${scenario.location}}}で、|${protagonistIntro}と|${friendIntro}は、|{{two_people}}で|${scenario.task}。`,
      narrativeFunction: "set_scene",
    },
    contextSetup: {
      stage: "context_setup",
      text: "{{two_people}}は、|つかう|{{place}}に|どうぐを|ならべました。",
      narrativeFunction: "attempt",
      referenceTargetRole: "opening",
    },
    trait: {
      stage: "trait",
      text: `${scenario.protagonist}は、|${trait.sentence}。`,
      narrativeFunction: "characterize",
    },
    expectation: {
      stage: "expectation",
      text: trait.expectation(scenario.protagonist),
      narrativeFunction: "attempt",
      referenceTargetRole: "opening",
    },
    explicitEmotion: {
      stage: "explicit_emotion",
      text: "ふたりで|できそうで、|うれしくなりました。",
      narrativeFunction: "react",
      referenceTargetRole: "expectation",
    },
    problem: {
      stage: "problem",
      text: `ところが、|${scenario.problem}。`,
      narrativeFunction: "encounter_problem",
      referenceTargetRole: "opening",
    },
    lateArrival: {
      stage: "late_arrival",
      text: `そこへ、|${lateEntrantIntro}が|あとから|やってきました。`,
      narrativeFunction: "set_scene",
      referenceTargetRole: "problem",
    },
    intervention: {
      stage: "intervention",
      text: `${scenario.lateEntrant}は、|${scenario.intervention}。`,
      narrativeFunction: "intervene",
      referenceTargetRole: "problem",
    },
    fact: {
      stage: "fact",
      text: `${scenario.protagonist}は、|${scenario.decision}に|しました。`,
      narrativeFunction: "decide",
      referenceTargetRole: "intervention",
    },
    inferenceSituation: {
      stage: "inference_situation",
      text: `${scenario.protagonist}は、|${scenario.lateEntrant}が|いっしょに|かんがえてくれたことに|きがつきました。`,
      narrativeFunction: "understand",
      referenceTargetRole: "intervention",
    },
    inferenceReaction: {
      stage: "inference_reaction",
      text: `${scenario.protagonist}は、|にこりとして、|かおを|あげました。`,
      narrativeFunction: "react",
      referenceTargetRole: "inference_situation",
    },
    resolution: {
      stage: "resolution",
      text: `${scenario.resolution}。`,
      narrativeFunction: "resolve",
      referenceTargetRole: "fact",
    },
    closing: {
      stage: "closing",
      text: `つかった|{{place}}を|かたづけ、|{{${scenario.location}}}で、|${scenario.protagonist}と|${scenario.friend}と|${scenario.lateEntrant}は、|さんにんで|わらいました。`,
      narrativeFunction: "aftermath",
      referenceTargetRole: "resolution",
    },
  } satisfies Record<string, StorySentenceDraft>;

  return [
    core.opening,
    core.contextSetup,
    ...expansions.before,
    core.trait,
    core.expectation,
    ...expansions.working,
    core.explicitEmotion,
    core.problem,
    core.lateArrival,
    core.intervention,
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
  readonly scenario: LateArrivalScenario;
  readonly trait: LateArrivalTrait;
}): QuestionContent {
  const traitLength = Array.from(trait.term).length;
  const decisionText = removePhraseMarkers(scenario.decision);
  const interventionText = removePhraseMarkers(scenario.intervention);
  const resolutionText = removePhraseMarkers(scenario.resolution);
  const causeChoice = `${scenario.lateEntrant}が${removePhraseMarkers(scenario.interventionReason)}、${scenario.protagonist}が${decisionText}にしたから。`;
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
      prompt: `{{${scenario.location}}}で|ふたりで|はじめたとき、|${scenario.protagonist}は|どのような|{{feeling}}でしたか。|えらびましょう。`,
      answer: "ふたりで|できそうで、|うれしい。",
      acceptableAnswers: ["ふたりでできそうで、うれしい。"],
      choices: [
        { text: "ふたりで|できそうで、|うれしい。", correct: true },
        { text: "だれも|こないと|おもい、|かなしい。", correct: false },
        { text: "すぐに|かえりたいと|おもい、|つまらない。", correct: false },
      ],
      evidenceRoles: ["explicit_emotion"],
      evidenceFragments: ["ふたりでできそうで、うれしくなりました"],
      correctChoiceText: "ふたりでできそうで、うれしい。",
      primaryConstruct: "C2_INTERPRET_EXPLICIT_EMOTION",
      secondaryDemands: ["場面と明示心情の対応", "選択肢比較"],
      requiredInferenceSteps: 0,
      scoringElements: [{ element_id: "correct_choice", points: 1, description: "第三人物が来る前の明示された心情を選ぶ" }],
      disqualifyingAnswers: ["第三人物が来た後の場面だけに対応する選択肢"],
      points: 1,
    },
    fact: {
      prompt: `${scenario.lateEntrant}は、|あとから|きて、|なにを|しましたか。|ぶんしょうから|かきぬきましょう。`,
      answer: scenario.intervention,
      acceptableAnswers: [interventionText],
      evidenceRole: "intervention",
      scoringElements: [{ element_id: "late_entrant_action", points: 1, description: `${scenario.lateEntrant}の行動を人物と対応させて抜き出す` }],
      disqualifyingAnswers: [`${scenario.protagonist}または${scenario.friend}の行動`],
      points: 1,
    },
    emotionOpen: {
      prompt: `かおを|あげたとき、|${scenario.protagonist}は|どのような|{{feeling}}でしたか。|りゆうと|いっしょに|かきましょう。`,
      answer: `${scenario.lateEntrant}が|いっしょに|かんがえてくれて、|ほっとした|{{feeling}}。`,
      acceptableAnswers: ["いっしょにかんがえてくれてほっとした", "たすけてもらってうれしい"],
      evidenceRole: "inference_situation",
      evidenceRoles: ["inference_situation", "inference_reaction"],
      evidenceFragments: [`${scenario.lateEntrant}がいっしょにかんがえてくれた`, "にこりとして"],
      answerSupports: [
        {
          scoringElementId: "situation",
          evidenceRole: "inference_situation",
          evidenceFragment: `${scenario.lateEntrant}がいっしょにかんがえてくれた`,
          answerFragmentsAny: ["いっしょにかんがえてくれて", "たすけてもらって"],
        },
        {
          scoringElementId: "emotion",
          evidenceRole: "inference_reaction",
          evidenceFragment: "にこりとして",
          answerFragmentsAny: ["ほっと", "うれしい", "あんしん"],
        },
      ],
      scoringElements: [
        { element_id: "situation", points: 1, description: `${scenario.lateEntrant}が一緒に考えた状況を捉える` },
        { element_id: "emotion", points: 1, description: "困っていた気持ちが軽くなったことに合う心情を示す" },
      ],
      disqualifyingAnswers: ["第三人物が来る前の心情だけを書く"],
      points: 2,
    },
    causeResult: {
      prompt: "なぜ、|さいごには|うまく|できたのですか。|えらびましょう。",
      answer: causeChoice,
      acceptableAnswers: [causeChoice],
      choices: [
        { text: `${scenario.lateEntrant}が|${scenario.interventionReason}、|${scenario.protagonist}が|${scenario.decision}に|したから。`, correct: true },
        { text: `${scenario.friend}が|ひとりで|ぜんぶ|なおしたから。`, correct: false },
        { text: `${scenario.protagonist}が|さっきと|おなじやりかたを|つづけたから。`, correct: false },
      ],
      evidenceRoles: ["intervention", "fact", "resolution"],
      evidenceFragments: [interventionText, decisionText, resolutionText],
      correctChoiceText: causeChoice,
      primaryConstruct: "C6_CONNECT_CAUSE_RESULT",
      secondaryDemands: ["人物ごとの行動の対応", "複数場面の因果統合"],
      requiredInferenceSteps: 2,
      scoringElements: [{ element_id: "late_arrival_cause", points: 1, description: "途中参加者の働きかけと主人公の行動を結果へつなぐ" }],
      disqualifyingAnswers: ["一人の行動だけで結果を説明する選択肢"],
      points: 1,
    },
    eventSequence: {
      prompt: `${scenario.lateEntrant}は、|${scenario.intervention}。|そのあと、|${scenario.protagonist}は|なにを|しましたか。|えらびましょう。`,
      answer: scenario.decision,
      acceptableAnswers: [decisionText],
      choices: [
        { text: `${scenario.decision}に|しました。`, correct: true },
        { text: `${scenario.friend}に|ぜんぶ|まかせました。`, correct: false },
        { text: "さっきと|おなじやりかたを|つづけました。", correct: false },
      ],
      evidenceRoles: ["intervention", "fact"],
      evidenceFragments: [interventionText, decisionText],
      correctChoiceText: `${decisionText}にしました。`,
      primaryConstruct: "C7_INTEGRATE_CONTEXT",
      secondaryDemands: ["途中参加前後の出来事の順序", "行動主体の区別"],
      requiredInferenceSteps: 1,
      scoringElements: [{ element_id: "after_entry_action", points: 1, description: "第三人物の行動後に主人公が選んだ行動を捉える" }],
      disqualifyingAnswers: ["別人物の行動を選ぶ"],
      points: 1,
    },
    sceneEmotion: {
      prompt: `さいごに、|${scenario.protagonist}は|どのような|{{feeling}}でしたか。|えらびましょう。`,
      answer: "さんにんで|うまく|できて、|うれしい|{{feeling}}。",
      acceptableAnswers: ["うれしい", "ほっとした", "よろこんでいる"],
      choices: [
        { text: "さんにんで|うまく|できて、|うれしい。", correct: true },
        { text: "まだ|こまったままで、|かなしい。", correct: false },
        { text: "いっしょに|するのが|いやで、|おこっている。", correct: false },
      ],
      evidenceRoles: ["resolution", "closing"],
      evidenceFragments: [resolutionText, "さんにんでわらいました"],
      correctChoiceText: "さんにんでうまくできて、うれしい。",
      primaryConstruct: "C3_INFER_EMOTION",
      secondaryDemands: ["結果と三人の反応からの心情推論", "選択肢比較"],
      requiredInferenceSteps: 1,
      scoringElements: [{ element_id: "scene_emotion", points: 1, description: "結果と三人の反応に合う心情を選ぶ" }],
      disqualifyingAnswers: ["途中の問題場面だけに対応する心情"],
      points: 1,
    },
    resolution: {
      prompt: "さいごに、|どうなりましたか。|ぶんしょうから|かきぬきましょう。",
      answer: scenario.resolution,
      acceptableAnswers: [resolutionText],
      evidenceRole: "resolution",
      scoringElements: [{ element_id: "result", points: 1, description: "三人で取り組んだ結果を過不足なく抜き出す" }],
      disqualifyingAnswers: ["第三人物が来る前の問題だけを書く"],
      points: 1,
    },
  };
}

function runLateArrivalChecks(worksheet: WorksheetCheckInput): MachineCheck[] {
  const roles = new Map(worksheet.passage.sentences.map((sentence, index) => [sentence.role, index]));
  const lateArrivalIndex = roles.get("late_arrival") ?? -1;
  const interventionIndex = roles.get("intervention") ?? -1;
  const problemIndex = roles.get("problem") ?? -1;
  const factIndex = roles.get("fact") ?? -1;
  const lateEntrant = worksheet.story.late_arriving_character;
  const firstMentionIndex = lateEntrant
    ? worksheet.passage.sentences.findIndex((sentence) => explicitlyNamesCharacter(sentence.plainText, lateEntrant))
    : -1;
  const interventionSentenceId = worksheet.passage.sentences[interventionIndex]?.sentence_id;
  const hasQuestionUsingIntervention = interventionSentenceId !== undefined
    && worksheet.questions.some((question) => question.evidence_ids.includes(interventionSentenceId));
  const issues: string[] = [];
  if (worksheet.story.character_structure !== "late_arrival_three_person") issues.push("character structure mismatch");
  if (!lateEntrant) issues.push("late arriving character is missing");
  if (!(problemIndex < lateArrivalIndex && lateArrivalIndex < interventionIndex && interventionIndex < factIndex)) {
    issues.push("late arrival role order mismatch");
  }
  if (firstMentionIndex !== lateArrivalIndex) issues.push("late entrant must first appear at late_arrival");
  if (!worksheet.passage.sentences.at(-1)?.plainText.includes("さんにん")) issues.push("closing must identify three participants");
  if (!hasQuestionUsingIntervention) issues.push("no question uses the late entrant intervention as evidence");

  return [
    ...runQuestionSetChecks(worksheet),
    {
      check_id: "late_arrival_character_contract",
      passed: issues.length === 0,
      details: {
        late_arriving_character: lateEntrant,
        problem_index: problemIndex,
        late_arrival_index: lateArrivalIndex,
        intervention_index: interventionIndex,
        fact_index: factIndex,
        first_mention_index: firstMentionIndex,
        question_uses_intervention: hasQuestionUsingIntervention,
        issues,
      },
    },
  ];
}

export const storyLateArrival4qBlueprint = Object.freeze({
  id: STORY_LATE_ARRIVAL_4Q_BLUEPRINT_ID,
  storyStructureId: STORY_LATE_ARRIVAL_STRUCTURE_ID,
  textType: "narrative",
  genre: "物語文",
  anchorIds: Object.freeze([
    "ANCHOR-STORY-Q06" as AnchorId,
    "ANCHOR-QUESTION-FORM-Q12" as AnchorId,
    "ANCHOR-QUESTION-FORM-Q18" as AnchorId,
  ]),
  evidenceRoles: Object.freeze([
    "trait",
    "explicit_emotion",
    "problem",
    "late_arrival",
    "intervention",
    "fact",
    "inference_situation",
    "inference_reaction",
    "resolution",
    "closing",
  ]),
  createScenario({ storyPlan, topic, random }: ScenarioInput) {
    if (storyPlan) throw new RangeError(`${STORY_LATE_ARRIVAL_4Q_BLUEPRINT_ID} does not accept story-plan.v1`);
    return chooseScenario(random, topic);
  },
  pickTrait(random: () => number) {
    return pick(random, TRAITS);
  },
  buildTitle({ scenario }: { readonly scenario: LateArrivalScenario }) {
    return scenario.title;
  },
  buildStorySentences,
  buildQuestionContent,
  buildStoryMetadata({ scenario, trait }: {
    readonly scenario: LateArrivalScenario;
    readonly trait: LateArrivalTrait;
    readonly storyPlan: StoryPlanV1 | null;
  }) {
    return {
      genre: "物語文",
      category: scenario.category,
      setting_lexeme_id: scenario.location as LexemeId,
      character_structure: "late_arrival_three_person",
      protagonist: {
        name: scenario.protagonist,
        trait: trait.term,
        goal: removePhraseMarkers(scenario.task),
      },
      supporting_character: scenario.friend,
      late_arriving_character: scenario.lateEntrant,
      event: {
        problem: removePhraseMarkers(scenario.problem),
        resolution: removePhraseMarkers(scenario.resolution),
        emotion_before: "うれしい",
        emotion_after: "ほっとした",
      },
    };
  },
  templateVersion(_input: { readonly storyPlan: StoryPlanV1 | null }) {
    return "deterministic-late-arrival-template.v0.4";
  },
  runMachineChecks: runLateArrivalChecks,
} satisfies Blueprint<LateArrivalScenario, LateArrivalTrait>);
