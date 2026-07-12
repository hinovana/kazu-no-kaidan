import { formatValue, givenValues, runNodesText } from "./solver.js";

const RENDER = {
  pageWidth: 210,
  pageHeight: 297,
  maxGraphWidth: 165,
  maxGraphHeight: 205,
  graphCenterY: 160.5,
};

export function renderSvg(problem, mode) {
  const geometry = graphGeometry(problem);
  const nodesById = Object.fromEntries(problem.nodes.map((node) => [node.id, node]));
  const title = escapeHtml(svgTitle(problem, mode));
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${RENDER.pageWidth}mm" height="${RENDER.pageHeight}mm" viewBox="0 0 ${RENDER.pageWidth} ${RENDER.pageHeight}" role="img">`,
    `<rect x="0" y="0" width="${RENDER.pageWidth}" height="${RENDER.pageHeight}" fill="white"/>`,
    `<text x="${(RENDER.pageWidth / 2).toFixed(3)}" y="24" text-anchor="middle" font-family="sans-serif" font-size="7.2" font-weight="700">${title}</text>`,
  ];

  for (const [a, b] of problem.edges) {
    const p1 = xy(nodesById[a], geometry);
    const p2 = xy(nodesById[b], geometry);
    lines.push(
      `<line x1="${p1.x.toFixed(3)}" y1="${p1.y.toFixed(3)}" x2="${p2.x.toFixed(3)}" y2="${p2.y.toFixed(3)}" stroke="black" stroke-width="${geometry.lineWidth.toFixed(3)}" stroke-linecap="round"/>`
    );
  }

  for (const node of problem.nodes) {
    const p = xy(node, geometry);
    lines.push(
      `<circle data-node-id="${escapeHtml(node.id)}" cx="${p.x.toFixed(3)}" cy="${p.y.toFixed(3)}" r="${geometry.radius.toFixed(3)}" fill="white" stroke="black" stroke-width="${geometry.circleStroke.toFixed(3)}"/>`
    );
    const label = nodeLabel(node, mode);
    if (label !== "") {
      const text = escapeHtml(label);
      const fontSize =
        mode === "ids" ? Math.min(5.2, geometry.radius * 0.76) : geometry.radius * (text.length === 1 ? 1.18 : 0.9);
      lines.push(
        `<text data-node-label="${escapeHtml(node.id)}" x="${p.x.toFixed(3)}" y="${(p.y + fontSize * 0.34).toFixed(3)}" text-anchor="middle" font-family="sans-serif" font-size="${fontSize.toFixed(3)}" font-weight="700">${text}</text>`
      );
    }
  }

  lines.push("</svg>");
  return lines.join("\n");
}

export function renderStepsHtml(problem, report) {
  if (report.kind === "text") {
    const items = report.steps
      .map((step, index) => {
        const text = escapeHtml(step.text);
        return `<li><span class="step-no">${String(index + 1).padStart(2, "0")}.</span><span class="step-run">整理</span><span class="step-equation">${text}</span></li>`;
      })
      .join("");
    return `<ol class="steps-list">${items}</ol>`;
  }

  const items = report.steps
    .map((step, index) => {
      const equation = escapeHtml(formatEquation(report.values, step));
      const run = escapeHtml(runNodesText(step.runNodes));
      return `<li><span class="step-no">${String(index + 1).padStart(2, "0")}.</span><span class="step-run">${run}</span><span class="step-equation">${equation}</span></li>`;
    })
    .join("");
  return `<ol class="steps-list">${items}</ol>`;
}

export function formatExplanation(problem, report) {
  if (report.explanationLines) {
    return listHtml(report.explanationLines);
  }

  const lines = [
    "この問題では、線でつながる3つの数に注目します。",
    "3つのうち、まん中の数は両端の数のちょうど真ん中になります。",
    "最初の手がかりは、3つのうち2つが分かっていて、空欄が1つだけの場所です。",
    "この問題では、初手で打てる手は1箇所だけです。",
  ];

  if (report.steps.length === 0) {
    lines.push("この配置では、あてずっぽう無しで次に決まるマスが見つかりません。");
    return listHtml(lines);
  }

  const known = givenValues(problem);
  for (let index = 0; index < report.steps.length; index += 1) {
    const step = report.steps[index];
    const stepValues = { ...known, [step.nodeId]: step.value };
    if (index === 0) {
      lines.push(...detailedStepText(stepValues, step, "最初は、"));
    } else if (index === 1) {
      lines.push(...detailedStepText(stepValues, step, "次に、"));
    } else {
      if (index === 2) {
        lines.push("ここから同じ考え方で、空欄が1つだけになったところを順番に見ていきます。");
      }
      lines.push(shortStepText(stepValues, step));
    }
    known[step.nodeId] = step.value;
  }

  lines.push("どこかをあてずっぽうで試す必要はありません。分かっている2つの数から、残りの1つを順番に決められます。");
  return listHtml(lines);
}

function svgTitle(problem, mode) {
  const label = mode === "problem" ? "問題" : mode === "ids" ? "IDマップ" : "解答";
  return `${problem.title}\u3000${label}\u3000${problem.problemId}`;
}

function nodeLabel(node, mode) {
  if (mode === "ids") {
    return node.id;
  }
  if (mode === "answer") {
    return String(node.answer);
  }
  return Object.prototype.hasOwnProperty.call(node, "given") ? String(node.given) : "";
}

function graphGeometry(problem) {
  const xs = problem.nodes.map((node) => node.x);
  const ys = problem.nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const graphW = maxX - minX;
  const graphH = maxY - minY;
  const scale = Math.min(RENDER.maxGraphWidth / graphW, RENDER.maxGraphHeight / graphH);
  const outW = graphW * scale;
  const outH = graphH * scale;

  return {
    minX,
    minY,
    scale,
    offsetX: (RENDER.pageWidth - outW) / 2,
    offsetY: RENDER.graphCenterY - outH / 2,
    radius: Math.max(4.9, Math.min(8.2, 23.5 * scale)),
    circleStroke: Math.max(0.75, Math.min(1.35, 3.1 * scale)),
    lineWidth: Math.max(1.3, Math.min(2.8, 7.5 * scale)),
  };
}

function xy(node, geometry) {
  return {
    x: geometry.offsetX + (node.x - geometry.minX) * geometry.scale,
    y: geometry.offsetY + (node.y - geometry.minY) * geometry.scale,
  };
}

function formatEquation(values, step) {
  const [a, b, c] = step.runNodes;
  const av = formatValue(values[a]);
  const bv = formatValue(values[b]);
  const cv = formatValue(values[c]);
  const result = formatValue(step.value);

  if (step.nodeId === a) {
    return `${a} = 2*${b} - ${c} = 2*${bv} - ${cv} = ${result}`;
  }
  if (step.nodeId === b) {
    return `${b} = (${a} + ${c}) / 2 = (${av} + ${cv}) / 2 = ${result}`;
  }
  if (step.nodeId === c) {
    return `${c} = 2*${b} - ${a} = 2*${bv} - ${av} = ${result}`;
  }
  throw new Error(`${step.nodeId} is not in ${runNodesText(step.runNodes)}`);
}

function detailedStepText(values, step, leadPrefix) {
  const [a, b, c] = step.runNodes;
  const knownIds = knownOrder(step.runNodes, step.nodeId);
  const result = formatValue(step.value);
  const lines = [
    `${leadPrefix}IDマップで ${runNodesText(step.runNodes)} の3マスを見ます。`,
    `${knownText(knownIds, values)} が分かっていて、空欄は ${step.nodeId} だけです。`,
  ];

  if (step.nodeId === b) {
    lines.push(`${formatValue(values[a])} と ${formatValue(values[c])} のちょうど真ん中は ${result} なので、${b} = ${result} と分かります。`);
  } else if (step.nodeId === a) {
    lines.push(`${c} = ${formatValue(values[c])} と ${a} のちょうど真ん中が ${b} = ${formatValue(values[b])} になるには、${a} = ${result} です。`);
  } else if (step.nodeId === c) {
    lines.push(`${a} = ${formatValue(values[a])} と ${c} のちょうど真ん中が ${b} = ${formatValue(values[b])} になるには、${c} = ${result} です。`);
  }
  return lines;
}

function shortStepText(values, step) {
  const [a, b, c] = step.runNodes;
  const result = formatValue(step.value);
  if (step.nodeId === b) {
    return `${a} = ${formatValue(values[a])} と ${c} = ${formatValue(values[c])} の真ん中なので、${b} = ${result} です。`;
  }
  if (step.nodeId === a) {
    return `${c} = ${formatValue(values[c])} と ${b} = ${formatValue(values[b])} から、${a} = ${result} と分かります。`;
  }
  return `${a} = ${formatValue(values[a])} と ${b} = ${formatValue(values[b])} から、${c} = ${result} と分かります。`;
}

function knownOrder(runNodes, missingId) {
  const [a, b, c] = runNodes;
  if (missingId === a) {
    return [c, b];
  }
  if (missingId === b) {
    return [a, c];
  }
  return [a, b];
}

function knownText(nodeIds, values) {
  return nodeIds.map((nodeId) => `${nodeId} = ${formatValue(values[nodeId])}`).join(" と ");
}

function listHtml(lines) {
  return `<ul class="explanation-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
