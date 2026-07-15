import { generateWorksheet } from "./generator.js";
import { checkAiProxy, requestStoryPlan } from "./ai-proxy-client.js";

const form = document.querySelector("#generatorForm");
const gradeSelect = document.querySelector("#gradeSelect");
const profileSelect = document.querySelector("#profileSelect");
const lengthSelect = document.querySelector("#lengthSelect");
const topicSelect = document.querySelector("#topicSelect");
const generationModeInputs = [...document.querySelectorAll('input[name="generationMode"]')];
const generationModeHelp = document.querySelector("#generationModeHelp");
const aiProxyFields = document.querySelector("#aiProxyFields");
const aiProxyUrlInput = document.querySelector("#aiProxyUrlInput");
const aiProxyCheckButton = document.querySelector("#aiProxyCheckButton");
const aiProxyStatus = document.querySelector("#aiProxyStatus");
const aiProxyDetails = document.querySelector("#aiProxyDetails");
const seedInput = document.querySelector("#seedInput");
const seedHelp = document.querySelector("#seedHelp");
const seedRandomButton = document.querySelector("#seedRandomButton");
const generateButton = document.querySelector("#generateButton");
const generationStatus = document.querySelector("#generationStatus");
const worksheetHeading = document.querySelector("#worksheetHeading");
const worksheetElement = document.querySelector("#worksheet");
const detailControls = document.querySelector("#detailControls");
const answerContent = document.querySelector("#answerContent");
const evidenceContent = document.querySelector("#evidenceContent");
let proxyConnectionInfo = null;

document.querySelector("#printButton").addEventListener("click", () => window.print());
seedRandomButton.addEventListener("click", () => {
  seedInput.value = createRandomSeed();
  generationStatus.classList.remove("is-error");
  generationStatus.textContent = "seedを変更しました。「この条件でつくる」を押すまで生成しません。";
});
generationModeInputs.forEach((input) => input.addEventListener("change", updateGenerationMode));
aiProxyCheckButton.addEventListener("click", checkProxyConnection);
aiProxyUrlInput.addEventListener("input", resetProxyConnection);
setupDisclosure("#answerToggle", "#answerPanel", "解答・解説を見る", "解答・解説を閉じる");
setupDisclosure("#evidenceToggle", "#evidencePanel", "生成根拠・品質を見る", "生成根拠・品質を閉じる");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const seed = seedInput.value.trim();
  if (!seed) {
    seedInput.focus();
    generationStatus.textContent = "seedを入力してください。";
    generationStatus.classList.add("is-error");
    return;
  }

  const config = {
    grade: Number(gradeSelect.value),
    profile: Number(profileSelect.value),
    length: lengthSelect.value,
    topic: topicSelect.value,
    seed,
  };

  setGenerating(true);
  try {
    let result;
    let completionMessage;
    if (getGenerationMode() === "ai_proxy") {
      try {
        if (!proxyConnectionInfo) {
          proxyConnectionInfo = await checkAiProxy(aiProxyUrlInput.value);
          setProxyConnected(proxyConnectionInfo);
        }
        const proxyResult = await requestStoryPlan(aiProxyUrlInput.value, config);
        result = generateWorksheet({
          ...config,
          storyPlan: proxyResult.story_plan,
          sourceMetadata: {
            source: "ai_proxy",
            candidate_id: proxyResult.candidate_id,
            request_id: proxyResult.request_id,
            model: proxyResult.model,
            prompt_version: proxyResult.prompt_version,
            prompt_hash: proxyResult.prompt_hash,
            context_version: proxyResult.context_version,
          },
        });
        setProxyConnected(proxyResult);
        completionMessage = `seed「${seed}」で、AIの物語の種を使った問題を生成しました。`;
      } catch (error) {
        if (error?.fallbackAllowed === false) {
          setProxyDisconnected(error);
          throw error;
        }
        result = generateWorksheet({
          ...config,
          sourceMetadata: {
            source: "local_fallback",
            error_code: error?.code ?? "AI_PROXY_ERROR",
          },
        });
        setProxyDisconnected(error);
        completionMessage = "AIサーバーから物語の種を取得できなかったため、今回はローカルアルゴリズムで生成しました。";
      }
    } else {
      result = generateWorksheet({ ...config, sourceMetadata: { source: "local" } });
      completionMessage = `seed「${seed}」の問題をローカルアルゴリズムで生成しました。`;
    }
    const worksheet = result?.worksheet ?? result?.item ?? result;
    if (!worksheet || !Array.isArray(worksheet.questions)) {
      throw new Error("生成結果に問題データがありません。");
    }

    renderWorksheet(worksheet, config);
    renderAnswers(worksheet.questions);
    renderEvidence(worksheet, config);
    detailControls.hidden = false;
    closeDisclosures();
    generationStatus.textContent = completionMessage;
    worksheetHeading.focus({ preventScroll: true });
    worksheetHeading.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    renderError(error);
    detailControls.hidden = true;
    generationStatus.textContent = "生成できませんでした。条件または実装状態を確認してください。";
    generationStatus.classList.add("is-error");
  } finally {
    setGenerating(false);
  }
});

const initialQuery = new URLSearchParams(window.location.search);
if (initialQuery.get("autogenerate") === "1") {
  const grade = initialQuery.get("grade");
  const profile = initialQuery.get("profile");
  const length = initialQuery.get("length");
  const topic = initialQuery.get("topic");
  const seed = initialQuery.get("seed");
  if (["1", "2", "3"].includes(grade)) gradeSelect.value = grade;
  if (["1", "2", "3", "4", "5"].includes(profile)) profileSelect.value = profile;
  if (["short", "standard", "long"].includes(length)) lengthSelect.value = length;
  if (["auto", "school", "home", "nature", "town", "animal"].includes(topic)) topicSelect.value = topic;
  if (seed) seedInput.value = seed.slice(0, 80);
  form.requestSubmit();
}

updateGenerationMode();

async function checkProxyConnection() {
  aiProxyCheckButton.disabled = true;
  aiProxyStatus.className = "proxy-status is-checking";
  aiProxyStatus.textContent = "確認中";
  aiProxyDetails.hidden = true;
  try {
    const health = await checkAiProxy(aiProxyUrlInput.value);
    proxyConnectionInfo = health;
    setProxyConnected(health);
  } catch (error) {
    setProxyDisconnected(error);
  } finally {
    aiProxyCheckButton.disabled = false;
  }
}

function updateGenerationMode() {
  const aiEnabled = getGenerationMode() === "ai_proxy";
  aiProxyFields.hidden = !aiEnabled;
  aiProxyUrlInput.disabled = !aiEnabled;
  aiProxyCheckButton.disabled = !aiEnabled;
  generationModeHelp.textContent = aiEnabled
    ? "すべての条件をAIへ送り、AIは再挑戦型の物語の種を作ります。本文・4問・長さ・根拠距離・表記は既存アルゴリズムが確定します。"
    : "学年・プロファイル・長さ・カテゴリ・seedを、ブラウザ内の決定的アルゴリズムへ適用します。本文構造もseedから選びます。";
  seedHelp.textContent = aiEnabled
    ? "AI生成では候補ID・キャッシュ・来歴に使います。同じseedだけでモデル出力の完全一致は保証しません。"
    : "アルゴリズムでは、本文構造を含め、同じ条件とseedから同じ問題を作ります。";
}

function getGenerationMode() {
  return generationModeInputs.find((input) => input.checked)?.value ?? "local";
}

function setProxyConnected(info) {
  aiProxyStatus.className = "proxy-status is-connected";
  aiProxyStatus.textContent = "接続済み";
  aiProxyDetails.textContent = `provider: ${info.provider ?? info.source ?? "openai"}／model: ${info.model ?? "unknown"}／prompt: ${info.prompt_version ?? "unknown"}`;
  aiProxyDetails.hidden = false;
}

function setProxyDisconnected(error) {
  proxyConnectionInfo = null;
  aiProxyStatus.className = "proxy-status is-error";
  aiProxyStatus.textContent = "切断中";
  aiProxyDetails.textContent = error instanceof Error ? error.message : String(error);
  aiProxyDetails.hidden = false;
}

function resetProxyConnection() {
  proxyConnectionInfo = null;
  aiProxyStatus.className = "proxy-status";
  aiProxyStatus.textContent = "未確認";
  aiProxyDetails.hidden = true;
}

function setGenerating(isGenerating) {
  generateButton.disabled = isGenerating;
  seedRandomButton.disabled = isGenerating;
  generationModeInputs.forEach((input) => { input.disabled = isGenerating; });
  aiProxyUrlInput.disabled = isGenerating || getGenerationMode() !== "ai_proxy";
  aiProxyCheckButton.disabled = isGenerating || getGenerationMode() !== "ai_proxy";
  worksheetElement.setAttribute("aria-busy", String(isGenerating));
  if (isGenerating) {
    generationStatus.classList.remove("is-error");
    generationStatus.textContent = "文章の構造と答えの根拠を確認しています…";
  }
}

function renderWorksheet(worksheet, config) {
  const fragment = document.createDocumentFragment();
  const readingPage = element("section", "worksheet-reading-page");

  const instruction = element("p", "reading-instruction");
  instruction.append(document.createTextNode("つぎの　"));
  const sentenceRuby = document.createElement("ruby");
  sentenceRuby.append(document.createTextNode("文"), textElement("rt", "", "ぶん"));
  instruction.append(
    sentenceRuby,
    document.createTextNode("しょうを　よんで　あとの　もんだいに　こたえましょう"),
  );
  readingPage.append(instruction);

  const title = element("h3", "worksheet-title");
  appendRichText(title, worksheet.title?.segments ?? worksheet.titleSegments ?? worksheet.title?.plainText ?? worksheet.title ?? "ものがたり");
  readingPage.append(title);

  const passage = element("section", "passage");
  passage.setAttribute("aria-label", "本文");
  for (const paragraph of normalizeParagraphs(worksheet.passage ?? worksheet.paragraphs)) {
    const paragraphElement = document.createElement("p");
    appendRichText(paragraphElement, paragraph);
    passage.append(paragraphElement);
  }
  readingPage.append(passage);
  fragment.append(readingPage);

  const questionsSection = element("section", "questions");
  const questionSheetMeta = element("header", "question-sheet-meta");
  questionSheetMeta.append(
    textElement("p", "question-sheet-subject", `小学${config.grade}年・国語`),
    textElement("p", "question-sheet-name", "なまえ"),
    textElement("span", "question-sheet-number", "2"),
  );
  questionsSection.append(questionSheetMeta);
  const questionList = element("ol", "question-list");
  worksheet.questions.forEach((question, index) => questionList.append(renderQuestion(question, index)));
  questionsSection.append(questionList);
  fragment.append(questionsSection);

  worksheetElement.replaceChildren(fragment);
}

function renderQuestion(question, index) {
  const questionType = String(question.type ?? question.format ?? "").toLowerCase();
  const typeClass = questionType.replaceAll("_", "-").replace(/[^a-z0-9-]/g, "");
  const item = element("li", `question question-${index + 1}${typeClass ? ` question-${typeClass}` : ""}`);
  item.dataset.questionType = questionType || "unknown";
  const prompt = element("p", "question-prompt");
  appendRichText(prompt, question.prompt?.segments ?? question.promptSegments ?? question.prompt?.plainText ?? question.prompt ?? "");
  item.append(prompt);

  const choices = question.choices ?? question.options;
  if (Array.isArray(choices) && choices.length > 0) {
    item.classList.add("is-choice");
    const list = element("ul", "choice-list");
    choices.forEach((choice, index) => {
      const choiceItem = document.createElement("li");
      choiceItem.append(textElement("span", "choice-mark", `${index + 1}`));
      const choiceText = document.createElement("span");
      appendRichText(choiceText, choice?.segments ?? choice?.plainText ?? choice?.text ?? choice);
      choiceItem.append(choiceText);
      list.append(choiceItem);
    });
    item.append(list);
  } else {
    if (questionType === "extract_explicit_trait_term") {
      item.classList.add("is-extract", "is-character-grid");
      const answerLength = Array.from(question.answer?.plainText ?? question.answer?.text ?? "").length;
      const grid = element("div", "character-grid");
      grid.setAttribute("aria-label", `${answerLength}文字の答えを書く欄`);
      for (let cellIndex = 0; cellIndex < answerLength; cellIndex += 1) {
        const cell = document.createElement("span");
        cell.setAttribute("aria-hidden", "true");
        grid.append(cell);
      }
      item.append(grid);
    } else if (questionType === "extract_fact") {
      item.classList.add("is-extract", "is-extract-box");
      const box = element("div", "answer-box");
      box.setAttribute("aria-label", "本文から抜き出した答えを書く欄");
      item.append(box);
    } else if (questionType === "infer_emotion") {
      item.classList.add("is-response");
      item.append(renderResponseZones());
    } else {
      const lines = element("div", "answer-lines");
      lines.setAttribute("aria-label", "答えを書く欄");
      lines.append(document.createElement("span"));
      item.append(lines);
    }
  }

  return item;
}

function renderResponseZones() {
  const container = element("div", "response-zones");
  container.setAttribute("aria-label", "理由と気持ちを書く欄");
  for (const [label, columnCount] of [["りゆう", 2], ["きもち", 1]]) {
    const zone = element("section", "response-zone");
    zone.append(textElement("h4", "response-zone-label", label));
    const columns = element("div", "response-columns");
    for (let index = 0; index < columnCount; index += 1) {
      const column = document.createElement("span");
      column.setAttribute("aria-hidden", "true");
      columns.append(column);
    }
    zone.append(columns);
    container.append(zone);
  }
  return container;
}

function renderAnswers(questions) {
  const fragment = document.createDocumentFragment();
  questions.forEach((question, index) => {
    const card = element("article", "answer-card");
    card.append(textElement("h4", "", `問${index + 1}`));

    const answerLine = document.createElement("p");
    answerLine.append(textElement("span", "answer-label", "答え　"));
    appendRichText(answerLine, question.answer?.segments ?? question.answer?.plainText ?? question.answer?.text ?? question.answer ?? "（答えなし）");
    card.append(answerLine);

    const explanation = question.explanation ?? question.rationale;
    if (explanation) {
      const explanationLine = document.createElement("p");
      explanationLine.append(textElement("span", "answer-label", "解説　"));
      appendRichText(explanationLine, explanation?.segments ?? explanation?.plainText ?? explanation);
      card.append(explanationLine);
    } else if (Array.isArray(question.scoring_elements) && question.scoring_elements.length > 0) {
      const scoringLine = document.createElement("p");
      scoringLine.append(textElement("span", "answer-label", "採点のポイント　"));
      scoringLine.append(document.createTextNode(question.scoring_elements
        .map((item) => item.description ?? item.label ?? item.element_id)
        .filter(Boolean)
        .join("／")));
      card.append(scoringLine);
    }

    const evidenceIds = question.evidence_ids ?? question.evidenceIds;
    if (Array.isArray(evidenceIds) && evidenceIds.length > 0) {
      card.append(textElement("p", "diagnostic-note", `本文根拠: ${evidenceIds.join(", ")}`));
    }
    fragment.append(card);
  });
  answerContent.replaceChildren(fragment);
}

function renderEvidence(worksheet, config) {
  const fragment = document.createDocumentFragment();
  const lifecycle = worksheet.lifecycle ?? worksheet.lifecycle_status ?? worksheet.status ?? "automated_checks_passed";
  const provenance = worksheet.generation_provenance ?? worksheet.provenance ?? {};
  const dbRelease = provenance.database_release ?? provenance.db_release ?? provenance.dbRelease ?? worksheet.db_release ?? worksheet.dbRelease ?? "unknown";
  const metadata = [
    ["item ID", readItemId(worksheet)],
    ["seed", provenance.seed ?? config.seed],
    ["DB release", dbRelease],
    ["lifecycle", lifecycle],
    ["漢字・ふりがな基準", `小学${config.grade}年暫定（語彙学年は未検証）`],
    ["生成条件", `profile ${config.profile}（実測難易度ではない）`],
    ["物語の長さ", `${lengthLabel(config.length)}（${worksheet.passage?.character_count ?? "?"}字）`],
    ["題材", config.topic],
    ["blueprint", provenance.blueprint_id ?? provenance.blueprint_version ?? worksheet.blueprint_id ?? "story-standard-4q.v1"],
    ["本文構造", provenance.story_structure_id ?? worksheet.story_structure_id ?? "unknown"],
    ["生成方式", provenance.generation_source ?? "local"],
    ["AI model", provenance.model ?? "未使用"],
    ["AI candidate", provenance.candidate_id ?? "未使用"],
  ];

  const metadataList = element("dl", "diagnostic-grid");
  for (const [label, value] of metadata) {
    const box = document.createElement("div");
    box.append(textElement("dt", "", label), textElement("dd", "", printable(value)));
    metadataList.append(box);
  }
  fragment.append(metadataList);

  const machineChecks = worksheet.machine_checks ?? worksheet.checks ?? worksheet.quality?.checks;
  const checks = normalizeChecks(machineChecks);
  fragment.append(textElement("h4", "checks-heading", "自動検査"));
  const checkList = element("ul", "check-list");
  if (checks.length === 0) {
    checkList.append(renderCheck({ name: "検査詳細は生成結果に含まれていません", status: "unknown" }));
  } else {
    checks.forEach((check) => checkList.append(renderCheck(check)));
  }
  fragment.append(checkList);

  const quality = worksheet.machine_checks?.quality_assessment ?? worksheet.quality_assessment ?? worksheet.quality;
  if (quality) {
    fragment.append(textElement("h4", "checks-heading", "品質評価の状態"));
    fragment.append(textElement(
      "p",
      "diagnostic-note",
      `${printable(quality.status ?? "not_formally_assessed")} — ${printable(quality.reason ?? "機械検査だけでは品質を確定できません。")}`,
    ));
  }

  const rubyPlan = worksheet.ruby_plan ?? worksheet.rubyPlan;
  if (rubyPlan) {
    fragment.append(textElement("h4", "checks-heading", "ふりがな計画"));
    fragment.append(textElement("p", "diagnostic-note", summarizeRubyPlan(rubyPlan)));
  }

  evidenceContent.replaceChildren(fragment);
}

function renderCheck(check) {
  const rawStatus = check.status ?? check.result ?? check.passed;
  const status = rawStatus === true || rawStatus === "pass" || rawStatus === "passed" || rawStatus === "ok"
    ? "pass"
    : rawStatus === false || rawStatus === "fail" || rawStatus === "failed" || rawStatus === "error"
      ? "fail"
      : "unknown";
  const item = element("li", `check-${status}`);
  const symbol = status === "pass" ? "✓ 合格" : status === "fail" ? "× 不合格" : "– 未詳";
  item.append(
    textElement("span", "check-symbol", symbol),
    textElement("span", "", printable(check.name ?? check.id ?? check.check_id ?? check.label ?? check)),
  );
  return item;
}

function renderError(error) {
  const container = element("div", "generation-error");
  container.setAttribute("role", "alert");
  container.append(
    textElement("strong", "", "問題を生成できませんでした"),
    textElement("p", "", error instanceof Error ? error.message : String(error)),
  );
  worksheetElement.replaceChildren(container);
}

function appendRichText(parent, value) {
  const segments = Array.isArray(value) ? value : [value];
  for (const segment of segments) {
    if (segment === null || segment === undefined) continue;
    if (typeof segment === "string" || typeof segment === "number") {
      parent.append(document.createTextNode(String(segment)));
      continue;
    }

    const reading = segment.reading ?? segment.ruby ?? segment.furigana ?? segment.rt;
    const base = segment.base ?? segment.text ?? segment.surface ?? segment.plainText ?? "";
    if (segment.type === "ruby" || reading) {
      const ruby = document.createElement("ruby");
      ruby.append(document.createTextNode(String(base)));
      const rt = document.createElement("rt");
      rt.textContent = String(reading ?? "");
      ruby.append(rt);
      parent.append(ruby);
    } else if (Array.isArray(segment.segments)) {
      appendRichText(parent, segment.segments);
    } else {
      parent.append(document.createTextNode(String(base)));
    }
  }
}

function normalizeParagraphs(passage) {
  const paragraphs = passage?.paragraphs ?? passage;
  if (Array.isArray(paragraphs) && paragraphs.length > 0) {
    return paragraphs.map((paragraph) => paragraph?.segments ?? paragraph?.sentences ?? paragraph?.plainText ?? paragraph?.text ?? paragraph);
  }
  const sentences = passage?.sentences;
  if (Array.isArray(sentences) && sentences.length > 0) {
    return [sentences.flatMap((sentence) => sentence?.segments ?? sentence?.plainText ?? sentence)];
  }
  return [passage?.segments ?? passage?.plainText ?? passage?.text ?? passage ?? "本文がありません。"];
}

function normalizeChecks(checks) {
  if (Array.isArray(checks?.checks)) return checks.checks;
  if (Array.isArray(checks)) return checks;
  if (!checks || typeof checks !== "object") return [];
  return Object.entries(checks).map(([name, value]) => (
    typeof value === "object" && value !== null ? { name, ...value } : { name, status: value }
  ));
}

function summarizeRubyPlan(plan) {
  if (Array.isArray(plan)) {
    const rubyCount = plan.filter((entry) => entry?.render_ruby === true).length;
    const repeatCount = plan.filter((entry) => entry?.reason === "repeat_occurrence").length;
    return `ふりがな表示 ${rubyCount}件、再出省略 ${repeatCount}件。本文内では初出に読みを示し、同じ語の再出では省略します。`;
  }
  const entries = plan.entries ?? plan.targets ?? plan.items;
  if (Array.isArray(entries)) return summarizeRubyPlan(entries);
  return "本文内では初出に読みを示し、同じ語の再出では省略する計画を適用しています。";
}

function readItemId(worksheet) {
  return worksheet.item_id ?? worksheet.itemId ?? worksheet.provenance?.item_id ?? worksheet.provenance?.itemId ?? "prototype-item";
}

function printable(value) {
  if (value === null || value === undefined) return "unknown";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function createRandomSeed() {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `tane-${[...values].map((value) => value.toString(36).padStart(7, "0")).join("")}`;
}

function lengthLabel(length) {
  return ({ short: "短め", standard: "ふつう", long: "長め" })[length] ?? String(length);
}

function setupDisclosure(toggleSelector, panelSelector, closedLabel, openLabel) {
  const toggle = document.querySelector(toggleSelector);
  const panel = document.querySelector(panelSelector);
  toggle.addEventListener("click", () => {
    const willOpen = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(willOpen));
    toggle.firstElementChild.textContent = willOpen ? openLabel : closedLabel;
    toggle.lastElementChild.textContent = willOpen ? "−" : "＋";
    panel.hidden = !willOpen;
  });
}

function closeDisclosures() {
  for (const toggle of document.querySelectorAll(".detail-toggle")) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.lastElementChild.textContent = "＋";
  }
  document.querySelector("#answerToggle").firstElementChild.textContent = "解答・解説を見る";
  document.querySelector("#evidenceToggle").firstElementChild.textContent = "生成根拠・品質を見る";
  document.querySelector("#answerPanel").hidden = true;
  document.querySelector("#evidencePanel").hidden = true;
}

function element(tagName, className) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  return node;
}

function textElement(tagName, className, text) {
  const node = element(tagName, className);
  node.textContent = text;
  return node;
}
