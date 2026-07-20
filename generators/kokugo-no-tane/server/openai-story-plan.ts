import { createHash } from "node:crypto";
import {
  STORY_PLAN_CONTEXT_VERSION,
  STORY_PLAN_JSON_SCHEMA,
  STORY_PLAN_PROMPT_VERSION,
  expectedCategoryForTopic,
  parseStoryPlan,
  stableJson,
} from "../domain/schemas/story-plan-v1.ts";
import { buildStoryPlanContext } from "./story-plan-context.ts";
import type {
  GenerationProfile,
  Grade,
  StoryLength,
  TopicId,
} from "../domain/types/generation.js";
import type { StoryPlanV1 } from "../domain/types/story-plan.js";

export interface StoryPlanProviderRequest {
  readonly client_request_id: string;
  readonly grade: Grade;
  readonly profile: GenerationProfile;
  readonly length: StoryLength;
  readonly topic: TopicId;
  readonly seed: string;
}

export type ProviderLogger = ((value: Readonly<Record<string, unknown>>) => void) | undefined;

interface OpenAiResponseContent {
  readonly type?: string;
  readonly refusal?: string;
  readonly text?: string;
}

interface OpenAiResponse {
  readonly id?: string | null;
  readonly object?: string;
  readonly model?: string | null;
  readonly status?: string | null;
  readonly usage?: unknown;
  readonly output_text?: string;
  readonly output?: readonly {
    readonly type?: string;
    readonly content?: readonly OpenAiResponseContent[];
  }[];
}

export interface OpenAiClientLike {
  readonly responses: {
    create(
      request: Readonly<Record<string, unknown>>,
      options: { readonly signal: AbortSignal | undefined },
    ): Promise<OpenAiResponse>;
  };
}

export interface StoryPlanProviderResult {
  readonly storyPlan: StoryPlanV1;
  readonly response: OpenAiResponse;
  readonly providerResponseId: string | null;
  readonly usage: unknown;
  readonly promptVersion: string;
  readonly promptHash: string;
  readonly contextVersion: string;
}

export const STORY_PLAN_INSTRUCTIONS = `
あなたは、小学1〜3年生向け国語読解問題の「物語設計図」だけを作ります。
本文、設問、解答、採点基準は作りません。

## 最優先の出力契約
- 指定されたJSON Schemaへ厳密に従う。
- 人物名と児童向けに文章化する全フィールドは、漢字・英字・数字を使わず、ひらがな・カタカナだけで書く。
- title_conceptは「〜をつくる」につながる短い物の名前にする。
- event.actionは「〜しよう」に相当する形、event.decisionは必ず「こと」で終える。
- event.problemとevent.resolutionは「ました」または「でした」で終え、句点を付けない。

## 良問に変換できる設計図の条件
- 身近で具体的な目標、目に見える小さな失敗、自分で選ぶ確かめ方、やり直した結果を一つの因果でつなぐ。
- 主人公の性格を示す語、失敗を相手に見られる場面、見られた直後の反応を、下流の本文で別々の文へ置けるようにする。
- 失敗前の期待と失敗後の行動を組み合わせると心情を推論できるようにする。emotion.afterだけを本文へ直接書く設計にはしない。
- 友達や大人が答えを教えて解決するのではなく、主人公が具体的な確認行動を決める。
- 目標・失敗・確認行動は同じ物や作業に関するものにし、偶然や魔法で解決しない。
- 指定seedを発想の分岐に使い、人物名、物、行動、失敗、確認方法の組合せを変える。
- 「地図の目印を間違えて、歩いた順番を確認する」だけへ寄せず、カテゴリ内で異なる作業と失敗を選ぶ。

## 学年と安全
- 小学一年は、一度に一つの目的と一段階のやり直しで理解できる生活場面にする。
- 小学二年は、二つの手掛かりを順に確認できる場面まで許す。
- 小学三年は、順序や比較を含めてもよいが、専門知識を答えの前提にしない。
- 失敗は小さく安全で、やり直せる内容にする。
- 恐怖、暴力、差別、性的内容、危険行為、個人情報を含めない。
- 特定の家庭構成、経済環境、地域文化、専門知識を正答の前提にしない。
- 実在教材の人物、固有の出来事、文章表現を再現しない。

## 採用前の自己点検
- goal、problem、decision、resolutionが因果でつながる。
- problemは主人公の小さな間違いとして観察できる。
- decisionは問題を解く具体的な確認行動である。
- resolutionはdecisionを実行した結果である。
- evidence_requirementsは、下流の本文に置く観察可能な根拠を二つか三つ指定する。
- 一般的な道徳語だけで正答できる設計、説教で終わる設計、失敗と無関係な解決は不採用にする。

## 合成例
以下は実在教材の転載や言い換えではなく、望ましい構造を示す本プロジェクト独自の例である。表現をコピーせず、構造だけを参考にする。

例一:
{"schema_version":"story-plan.v1","category":"自然","title_concept":"はっぱのしおり","setting":{"type":"park","name":"かわべのこうえん"},"protagonist":{"name":"すず","role":"しょうがくせい"},"supporting_character":{"name":"るい","role":"ともだち"},"goal":"はっぱのしおりをかんせいさせる","event":{"action":"はっぱをならべよう","problem":"おおきいはっぱをうらがえしにはってしまいました","decision":"かたちをたしかめてからはること","resolution":"しおりのもようをきれいになおしました"},"emotion":{"before":"たのしみ","after":"はずかしい"},"evidence_requirements":["せいかくをしめすことばをおける","しっぱいをみられたばめんとはんのうをわけられる","きたいとやりなおすこうどうをべつにおける"]}

例二:
{"schema_version":"story-plan.v1","category":"動物","title_concept":"きのみのかざり","setting":{"type":"forest","name":"どんぐりのもり"},"protagonist":{"name":"ミミ","role":"こりす"},"supporting_character":{"name":"トト","role":"ことり"},"goal":"きのみのかざりをかんせいさせる","event":{"action":"きのみをいろべつにならべよう","problem":"ちゃいろのきのみをあかいれつにおいてしまいました","decision":"かごのはしからいろをたしかめること","resolution":"きのみをただしいれつにならべなおしました"},"emotion":{"before":"わくわく","after":"はずかしい"},"evidence_requirements":["せいかくをしめすことばをおける","あいてのしせんとしゅじんこうのはんのうをわけられる","まちがいとたしかめかたをむすべられる"]}
`.trim();

export async function requestOpenAiStoryPlan({
  client,
  config,
  request,
  signal,
  logger,
}: {
  readonly client: OpenAiClientLike;
  readonly config: { readonly model: string };
  readonly request: StoryPlanProviderRequest;
  readonly signal?: AbortSignal;
  readonly logger?: ProviderLogger;
}): Promise<StoryPlanProviderResult> {
  const generationInput = buildStoryPlanGenerationInput(request);
  const curriculumContext = generationInput.curriculum_context;
  const promptHash = createHash("sha256")
    .update(`${STORY_PLAN_INSTRUCTIONS}\n${stableJson(curriculumContext) ?? ""}`)
    .digest("hex");
  const providerRequest = {
    model: config.model,
    reasoning: { effort: "high" },
    instructions: STORY_PLAN_INSTRUCTIONS,
    input: JSON.stringify(generationInput),
    text: {
      format: {
        type: "json_schema",
        name: "kokugo_story_plan",
        strict: true,
        schema: STORY_PLAN_JSON_SCHEMA,
      },
    },
    max_output_tokens: 1200,
    store: false,
  };
  logProviderIo(logger, {
    event: "ai_provider_request",
    provider: "openai",
    model: config.model,
    client_request_id: request.client_request_id,
    request: providerRequest,
  });
  const response = await client.responses.create(providerRequest, { signal });

  const refusal = findRefusal(response);
  const outputText = response.output_text || findOutputText(response);
  logProviderIo(logger, {
    event: "ai_provider_response",
    provider: "openai",
    model: response.model ?? config.model,
    client_request_id: request.client_request_id,
    response: {
      id: response.id ?? null,
      status: response.status ?? null,
      output_text: outputText || null,
      refusal,
      usage: response.usage ?? null,
    },
  });
  if (refusal) {
    throw providerError("The model refused to create a story plan", "AI_REFUSAL");
  }

  if (!outputText) {
    throw providerError("The model response did not contain structured output", "SCHEMA_INVALID");
  }

  const storyPlan = parseGeneratedStoryPlan(outputText, request);

  return {
    storyPlan,
    response,
    providerResponseId: response.id ?? null,
    usage: response.usage ?? null,
    promptVersion: STORY_PLAN_PROMPT_VERSION,
    promptHash,
    contextVersion: STORY_PLAN_CONTEXT_VERSION,
  };
}

function logProviderIo(logger: ProviderLogger, value: Readonly<Record<string, unknown>>): void {
  if (typeof logger === "function") logger(value);
}

export function buildStoryPlanGenerationInput(request: StoryPlanProviderRequest) {
  return {
    target_grade: request.grade,
    generation_profile: request.profile,
    passage_length: request.length,
    topic: request.topic,
    candidate_seed: request.seed,
    requested_category: expectedCategoryForTopic(request.topic),
    curriculum_context: buildStoryPlanContext(request.grade),
  };
}

export function parseGeneratedStoryPlan(
  outputText: string,
  request: StoryPlanProviderRequest,
): StoryPlanV1 {
  let decoded: unknown;
  try {
    decoded = JSON.parse(outputText);
  } catch {
    throw providerError("The structured output was not valid JSON", "SCHEMA_INVALID");
  }
  const storyPlan = parseStoryPlan(decoded);
  const expectedCategory = expectedCategoryForTopic(request.topic);
  if (expectedCategory && storyPlan.category !== expectedCategory) {
    throw providerError("The story category did not match the requested topic", "CONTENT_REJECTED");
  }
  return storyPlan;
}

function findRefusal(response: OpenAiResponse): string | null {
  for (const item of response?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "refusal") return content.refusal || "refused";
    }
  }
  return null;
}

function findOutputText(response: OpenAiResponse): string {
  return (response?.output ?? [])
    .flatMap((item) => item?.content ?? [])
    .filter((content) => content?.type === "output_text")
    .map((content) => content.text ?? "")
    .join("");
}

function providerError(
  message: string,
  code: string,
): Error & { readonly code: string } {
  return Object.assign(new Error(message), { code });
}
