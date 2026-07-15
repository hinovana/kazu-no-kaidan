import { runStandardFourQuestionChecks } from "./standard-four-question-checks.js";

export const STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID = "story-clue-discovery-4q.v1";
export const STORY_CLUE_DISCOVERY_STRUCTURE_ID = "story-clue-discovery.v1";

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
    attention: (name) => `${name}は、|ちいさなちがいにも|すぐに|きがつきました。`,
  },
  {
    term: "しりたがり",
    sentence: "しりたがりな|ひとです",
    attention: (name) => `${name}は、|ふしぎにおもうと、|もっと|しりたくなりました。`,
  },
  {
    term: "ねばりづよい",
    sentence: "ねばりづよい|ひとです",
    attention: (name) => `${name}は、|わかるまで|しらべることが|すきでした。`,
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

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function shuffled(random, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function removePhraseMarkers(text) {
  return String(text).replaceAll("|", "");
}

function substitute(template, values) {
  return template
    .replaceAll("しゅじんこう", values.protagonist)
    .replaceAll("ともだち", values.friend);
}

function chooseScenario(random, topic) {
  if (topic) {
    const topicAliases = {
      school: "学校",
      home: "家庭",
      nature: "自然",
      town: "町",
      animal: "動物",
    };
    const resolvedTopic = topicAliases[topic] ?? topic;
    const matches = SCENARIOS.filter((scenario) =>
      scenario.category === resolvedTopic
        || scenario.topicWords.some((word) => String(resolvedTopic).includes(word)),
    );
    if (matches.length > 0) return pick(random, matches);
  }
  return pick(random, SCENARIOS);
}

function buildStorySentences({ scenario, trait, profile, lengthSetting, random }) {
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

  const requiredAfterCount = [0, 0, 1, 2, 4][profile - 1];
  const extraCount = Math.max(lengthSetting.extra_count, requiredAfterCount);
  const remainingCount = extraCount - requiredAfterCount;
  const stageCounts = {
    before: Math.ceil(remainingCount / 3),
    working: Math.ceil((remainingCount - Math.ceil(remainingCount / 3)) / 2),
    after: requiredAfterCount,
  };
  stageCounts.resolution = extraCount - stageCounts.before - stageCounts.working - stageCounts.after;
  const details = Object.fromEntries(Object.entries(DETAILS).map(([stage, options]) => [
    stage,
    shuffled(random, options).slice(0, Math.max(0, stageCounts[stage] ?? 0))
      .map((text) => ({ stage: `detail_${stage}`, text: substitute(text, values) })),
  ]));

  return [
    core[0],
    ...details.before,
    core[1],
    core[2],
    ...details.working,
    core[3],
    core[4],
    core[5],
    core[6],
    ...details.after,
    core[7],
    ...details.resolution,
    core[8],
    core[9],
  ];
}

function buildQuestions({ render, scenario, trait, evidence, random }) {
  const traitLength = Array.from(trait).length;
  const questionSpecs = [
    {
      question_id: "q1",
      type: "extract_explicit_trait_term",
      primary_construct: "C1_LOCATE_EXPLICIT",
      secondary_demands: ["指定字数の抜き出し"],
      prompt: `${scenario.protagonist}は、|どのような|ひとですか。|ぶんしょうから|${traitLength}もじで|かきぬきましょう。`,
      answer: trait,
      acceptable_answers: [trait],
      evidence_ids: [evidence.trait],
      required_inference_steps: 0,
      scoring_elements: [{ element_id: "exact_extract", points: 1, description: `${trait}を過不足なく抜き出す` }],
      disqualifying_answers: ["本文にない性格語"],
      points: 1,
    },
    {
      question_id: "q2",
      type: "emotion_choice",
      primary_construct: "C2_INTERPRET_EXPLICIT_EMOTION",
      secondary_demands: ["場面と明示心情の対応", "選択肢比較"],
      prompt: `{{${scenario.location}}}で|しらべはじめたとき、|${scenario.protagonist}は|どのような|{{feeling}}でしたか。|えらびましょう。`,
      choices: shuffled(random, [
        { text: "なにが|わかるのか|たのしみで、|わくわくしている。", correct: true },
        { text: "なにも|みつからないと|おもい、|がっかりしている。", correct: false },
        { text: "はやく|おわりたいと|おもい、|つまらなく|かんじている。", correct: false },
      ]),
      answer: `{{${scenario.location}}}で、|なにが|わかるのか|たのしみで、|わくわくしている。`,
      acceptable_answers: ["なにがわかるのかたのしみで、わくわくしている。"],
      evidence_ids: [evidence.explicit_emotion],
      required_inference_steps: 0,
      scoring_elements: [{ element_id: "correct_choice", points: 1, description: "明示された心情と一致する選択肢を選ぶ" }],
      disqualifying_answers: ["本文の別場面だけに対応する選択肢"],
      points: 1,
      validation_contract: {
        evidence_role: "explicit_emotion",
        evidence_fragment: "なにがわかるのかたのしみで、わくわくしました",
        correct_choice_text: "なにがわかるのかたのしみで、わくわくしている。",
      },
    },
    {
      question_id: "q3",
      type: "extract_fact",
      primary_construct: "C1_LOCATE_EXPLICIT",
      secondary_demands: ["明示情報の探索"],
      prompt: `${scenario.protagonist}は、|みつけたことを|たしかめるために、|なにを|することにしましたか。|ぶんしょうから|かきぬきましょう。`,
      answer: scenario.decision,
      acceptable_answers: [removePhraseMarkers(scenario.decision)],
      evidence_ids: [evidence.fact],
      required_inference_steps: 0,
      scoring_elements: [{ element_id: "exact_fact", points: 1, description: `${removePhraseMarkers(scenario.decision)}を過不足なく抜き出す` }],
      disqualifying_answers: ["発見した結果だけを書いた答え"],
      points: 1,
    },
    {
      question_id: "q4",
      type: "infer_emotion",
      primary_construct: "C3_INFER_EMOTION",
      secondary_demands: ["C5_COMPOSE_WITH_EVIDENCE"],
      prompt: `${scenario.friend}に|ちいさく|うなずいたとき、|${scenario.protagonist}は|どのような|{{feeling}}でしたか。|りゆうと|いっしょに|かきましょう。`,
      answer: "しるしの|ひみつが|わかって、|うれしい|{{feeling}}。",
      acceptable_answers: ["しるしがつながってうれしい", "ひみつがわかってよろこんでいる"],
      evidence_ids: [evidence.inference_situation, evidence.inference_reaction],
      required_inference_steps: 1,
      answer_policy: "evidence_supported_open_response",
      scoring_elements: [
        { element_id: "situation", points: 1, description: "手がかりがつながって、ひみつがわかった状況を捉える" },
        { element_id: "emotion", points: 1, description: "うなずく反応と合う、うれしい・わくわくした・喜んだなどの心情を示す" },
      ],
      disqualifying_answers: ["かなしいなど根拠と反対の心情だけを書き、本文根拠を示さない"],
      points: 2,
      validation_contract: {
        evidence_roles: ["inference_situation", "inference_reaction"],
        evidence_fragments: [scenario.matchFragment, "ちいさくうなずきました"],
        answer_fragments_any: ["うれしい", "わくわく", "よろこん"],
      },
    },
  ];

  return questionSpecs.map((spec) => {
    const scope = `question_${spec.question_id}`;
    const prompt = render(spec.prompt, scope, `${spec.question_id}_prompt`);
    const choices = spec.choices?.map((choice, index) => ({
      choice_id: String.fromCharCode(97 + index),
      ...render(choice.text, scope, `${spec.question_id}_choice_${index + 1}`),
      is_correct: choice.correct,
    }));
    const answer = render(spec.answer, `answer_${spec.question_id}`, `${spec.question_id}_answer`);
    return {
      ...spec,
      prompt,
      answer,
      choices,
      correct_choice_id: choices?.find((choice) => choice.is_correct)?.choice_id,
    };
  });
}

export const storyClueDiscovery4qBlueprint = Object.freeze({
  id: STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
  storyStructureId: STORY_CLUE_DISCOVERY_STRUCTURE_ID,
  textType: "narrative",
  genre: "物語文",
  anchorIds: Object.freeze(["ANCHOR-STORY-Q06", "ANCHOR-RUBY-Q12", "ANCHOR-RUBY-Q18"]),
  evidenceRoles: Object.freeze(["trait", "explicit_emotion", "fact", "inference_situation", "inference_reaction"]),
  createScenario({ storyPlan, topic, random }) {
    if (storyPlan) throw new RangeError(`${STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID} does not accept story-plan.v1`);
    return chooseScenario(random, topic);
  },
  pickTrait(random) {
    return pick(random, TRAITS);
  },
  buildTitle({ scenario }) {
    return scenario.title;
  },
  buildStorySentences,
  buildQuestions,
  buildStoryMetadata({ scenario, trait }) {
    return {
      genre: "物語文",
      category: scenario.category,
      setting_lexeme_id: scenario.location,
      protagonist: {
        name: scenario.protagonist,
        trait: trait.term,
        goal: `${removePhraseMarkers(scenario.subject)}のひみつをみつける`,
      },
      supporting_character: scenario.friend,
      event: {
        problem: null,
        clue: removePhraseMarkers(scenario.clue),
        resolution: removePhraseMarkers(scenario.discovery),
        emotion_before: "わくわく",
        emotion_after: "うれしい",
      },
    };
  },
  templateVersion() {
    return "deterministic-clue-discovery-template.v0.1";
  },
  runMachineChecks: runStandardFourQuestionChecks,
});
