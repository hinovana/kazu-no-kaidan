from __future__ import annotations

from fractions import Fraction
from typing import Mapping

from .model import PropagationReport, answer_values, given_values
from .svg_renderer import render_svg
from .solver import linear_solution


def format_value(value) -> str:
    if value.denominator == 1:
        return str(value.numerator)
    return f"{value.numerator}/{value.denominator}"


def _format_label(value) -> str:
    if isinstance(value, Fraction):
        return format_value(value)
    return str(value)


def _node_label(node, labels: Mapping[str, object] | None = None) -> str:
    if labels is not None:
        return _format_label(labels.get(node["id"], ""))
    if "given" in node:
        return str(node["given"])
    return ""


def _token_width(problem, display_labels: Mapping[str, object] | None = None) -> int:
    label_candidates = []
    for node in problem["nodes"]:
        label_candidates.append(node["id"])
        label_candidates.append(str(node.get("given", "")))
        label_candidates.append(str(node["answer"]))
        if display_labels is not None:
            label_candidates.append(_format_label(display_labels.get(node["id"], "")))
    return max(2, *(len(label) for label in label_candidates)) + 2


def _node_token(
    node, token_width: int, labels: Mapping[str, object] | None = None
) -> str:
    label = _node_label(node, labels)
    inner_width = token_width - 2
    return f"[{label:>{inner_width}}]"


def id_labels(problem) -> dict[str, str]:
    return {node["id"]: node["id"] for node in problem["nodes"]}


def format_diagram(problem, labels: Mapping[str, object] | None = None) -> str:
    nodes = {node["id"]: node for node in problem["nodes"]}
    xs = sorted({round(node["x"], 3) for node in problem["nodes"]})
    ys = sorted({round(node["y"], 3) for node in problem["nodes"]})
    x_rank = {x: i for i, x in enumerate(xs)}
    y_rank = {y: i for i, y in enumerate(ys)}
    token_width = _token_width(problem, labels)
    col_unit = token_width + 2
    row_unit = 2
    half = token_width // 2

    def center(node_id: str) -> tuple[int, int]:
        node = nodes[node_id]
        col = half + x_rank[round(node["x"], 3)] * col_unit
        row = y_rank[round(node["y"], 3)] * row_unit
        return int(col), int(row)

    centers = {node["id"]: center(node["id"]) for node in problem["nodes"]}
    width = max(col + half for col, _row in centers.values()) + 1
    height = max(row for _col, row in centers.values()) + 1
    canvas = [[" " for _ in range(width)] for _ in range(height)]

    def put(row: int, col: int, char: str) -> None:
        if 0 <= row < height and 0 <= col < width:
            current = canvas[row][col]
            canvas[row][col] = char if current == " " or current == char else "+"

    def draw_edge(a: str, b: str) -> None:
        c1, r1 = centers[a]
        c2, r2 = centers[b]
        dc = c2 - c1
        dr = r2 - r1

        if dr == 0:
            start = min(c1, c2) + half + 1
            end = max(c1, c2) - half
            for col in range(start, end):
                put(r1, col, "-")
            return

        if dc == 0:
            start = min(r1, r2) + 1
            end = max(r1, r2)
            for row in range(start, end):
                put(row, c1, "|")
            return

        char = "\\" if (dc > 0) == (dr > 0) else "/"
        steps = abs(dr)
        for step in range(1, steps):
            row = r1 + (1 if dr > 0 else -1) * step
            col = round(c1 + dc * step / steps)
            put(row, col, char)

    for a, b in problem["edges"]:
        draw_edge(a, b)

    for node in problem["nodes"]:
        col, row = centers[node["id"]]
        token = _node_token(node, token_width, labels)
        left = col - half
        for offset, char in enumerate(token):
            put(row, left + offset, char)

    return "\n".join("".join(row).rstrip() for row in canvas)


def _format_equation(problem, values, step) -> str:
    run = next(run for run in problem["runs"] if run["id"] == step.run_id)
    a, b, c = run["nodes"]
    av = format_value(values[a])
    bv = format_value(values[b])
    cv = format_value(values[c])
    result = format_value(step.value)

    if step.node_id == a:
        return f"{a} = 2*{b} - {c} = 2*{bv} - {cv} = {result}"
    if step.node_id == b:
        return f"{b} = ({a} + {c}) / 2 = ({av} + {cv}) / 2 = {result}"
    if step.node_id == c:
        return f"{c} = 2*{b} - {a} = 2*{bv} - {av} = {result}"
    raise ValueError(f"step node {step.node_id} is not in run {step.run_id}")


def _run_for_step(problem, step):
    return next(run for run in problem["runs"] if run["id"] == step.run_id)


def _known_order(run_nodes: list[str], missing_id: str) -> list[str]:
    a, b, c = run_nodes
    if missing_id == a:
        return [c, b]
    if missing_id == b:
        return [a, c]
    if missing_id == c:
        return [a, b]
    raise ValueError(f"{missing_id} is not in run {run_nodes}")


def _known_text(node_ids: list[str], values) -> str:
    return " と ".join(f"{node_id} = {format_value(values[node_id])}" for node_id in node_ids)


def _run_nodes_text(run_nodes: list[str]) -> str:
    return f"({', '.join(run_nodes)})"


def _detailed_step_text(problem, values, step, lead_prefix: str) -> list[str]:
    run = _run_for_step(problem, step)
    a, b, c = run["nodes"]
    known_ids = _known_order(run["nodes"], step.node_id)
    result = format_value(step.value)

    lines = [
        f"- {lead_prefix}IDマップで {_run_nodes_text(run['nodes'])} の3マスを見ます。",
        f"- {_known_text(known_ids, values)} が分かっていて、空欄は {step.node_id} だけです。",
    ]
    if step.node_id == b:
        av = format_value(values[a])
        cv = format_value(values[c])
        lines.append(f"- {av} と {cv} のちょうど真ん中は {result} なので、{b} = {result} と分かります。")
    elif step.node_id == a:
        bv = format_value(values[b])
        cv = format_value(values[c])
        lines.append(
            f"- {c} = {cv} と {a} のちょうど真ん中が {b} = {bv} になるには、{a} = {result} です。"
        )
    elif step.node_id == c:
        av = format_value(values[a])
        bv = format_value(values[b])
        lines.append(
            f"- {a} = {av} と {c} のちょうど真ん中が {b} = {bv} になるには、{c} = {result} です。"
        )
    return lines


def _short_step_text(problem, values, step) -> str:
    run = _run_for_step(problem, step)
    a, b, c = run["nodes"]
    result = format_value(step.value)

    if step.node_id == b:
        av = format_value(values[a])
        cv = format_value(values[c])
        return f"- {a} = {av} と {c} = {cv} の真ん中なので、{b} = {result} です。"
    if step.node_id == a:
        bv = format_value(values[b])
        cv = format_value(values[c])
        return f"- {c} = {cv} と {b} = {bv} から、{a} = {result} と分かります。"
    if step.node_id == c:
        av = format_value(values[a])
        bv = format_value(values[b])
        return f"- {a} = {av} と {b} = {bv} から、{c} = {result} と分かります。"
    raise ValueError(f"step node {step.node_id} is not in run {step.run_id}")


def format_solution_explanation(problem, report: PropagationReport) -> str:
    lines = [
        "- この問題では、線でつながる3つの数に注目します。",
        "- 3つのうち、まん中の数は両端の数のちょうど真ん中になります。",
        "- 最初の手がかりは、3つのうち2つが分かっていて、空欄が1つだけの場所です。",
    ]

    if not report.steps:
        lines.append("- この配置では、あてずっぽう無しで次に決まるマスが見つかりません。")
        return "\n".join(lines)

    known = given_values(problem)
    for index, step in enumerate(report.steps):
        step_values = {**known, step.node_id: step.value}
        if index == 0:
            lines.extend(_detailed_step_text(problem, step_values, step, "最初は、"))
        elif index == 1:
            lines.extend(_detailed_step_text(problem, step_values, step, "次に、"))
        else:
            if index == 2:
                lines.append("- ここから同じ考え方で、空欄が1つだけになったところを順番に見ていきます。")
            lines.append(_short_step_text(problem, step_values, step))
        known[step.node_id] = step.value

    lines.append(
        "- どこかをあてずっぽうで試す必要はありません。分かっている2つの数から、残りの1つを順番に決められます。"
    )
    return "\n".join(lines)


def print_solution(problem, report: PropagationReport) -> None:
    width = 72
    print("\n" + "=" * width)
    print(f"{problem['title']} / 問題{problem['problem_no']}")
    print("=" * width)

    print("")
    print("[IDマップ]")
    print(format_diagram(problem, id_labels(problem)))

    print("")
    print("[初期配置]")
    print(format_diagram(problem))

    print("")
    print("[解答]")
    print(format_diagram(problem, report.values))

    print("")
    print("[あてずっぽう無しの確定順]")
    for i, step in enumerate(report.steps, start=1):
        run_label = _run_nodes_text(_run_for_step(problem, step)["nodes"])
        print(f"{i:02d}. {run_label:<14}  {_format_equation(problem, report.values, step)}")

    print("")
    print("[解き方]")
    print(format_solution_explanation(problem, report))

    print("")
    print("[判定]")
    unique, solution = linear_solution(problem)
    svg = render_svg(problem)
    one_solution = "OK" if unique and solution == answer_values(problem) else "NG"
    no_branching = "OK" if not report.unresolved else "NG"
    svg_generated = "OK" if "<svg" in svg and svg.count("data-node-id=") == len(problem["nodes"]) else "NG"
    print(f"- 一意解: {one_solution}")
    print(f"- 分岐なし推論: {no_branching} ({len(report.steps)}個すべて確定)")
    print(f"- SVG生成: {svg_generated}")
    print("")
