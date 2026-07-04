from __future__ import annotations

import html
from typing import Any

from .model import nodes_by_id


def _problem_marker(problem_no: object) -> str:
    try:
        number = int(problem_no)
    except (TypeError, ValueError):
        return str(problem_no)

    if 1 <= number <= 20:
        return chr(0x2460 + number - 1)
    return str(problem_no)


def _heading(problem: dict[str, Any]) -> str:
    title = str(problem.get("title", "")).strip()
    marker = _problem_marker(problem.get("problem_no", "")).strip()
    if title and marker:
        return f"{title}\u3000{marker}"
    return title or marker


def render_svg(problem: dict[str, Any], *, show_answers: bool = False) -> str:
    nodes = nodes_by_id(problem)
    page_w = float(problem["render"].get("page_width_mm", 210))
    page_h = float(problem["render"].get("page_height_mm", 297))
    max_w = float(problem["render"].get("max_graph_width_mm", 165))
    max_h = float(problem["render"].get("max_graph_height_mm", 205))
    center_y = float(problem["render"].get("graph_center_y_mm", 160.5))

    xs = [float(node["x"]) for node in problem["nodes"]]
    ys = [float(node["y"]) for node in problem["nodes"]]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    graph_w = max_x - min_x
    graph_h = max_y - min_y
    scale = min(max_w / graph_w, max_h / graph_h)
    out_w = graph_w * scale
    out_h = graph_h * scale
    offset_x = (page_w - out_w) / 2
    offset_y = center_y - out_h / 2

    def xy(node_id: str) -> tuple[float, float]:
        node = nodes[node_id]
        return offset_x + (node["x"] - min_x) * scale, offset_y + (node["y"] - min_y) * scale

    radius = max(4.9, min(8.2, 23.5 * scale))
    circle_stroke = max(0.75, min(1.35, 3.1 * scale))
    line_width = max(1.3, min(2.8, 7.5 * scale))
    title = html.escape(_heading(problem))

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{page_w:g}mm" height="{page_h:g}mm" viewBox="0 0 {page_w:g} {page_h:g}">',
        f'<rect x="0" y="0" width="{page_w:g}" height="{page_h:g}" fill="white"/>',
        f'<text x="{page_w / 2:.3f}" y="24" text-anchor="middle" font-family="sans-serif" font-size="7.2" font-weight="700">{title}</text>',
    ]

    for a, b in problem["edges"]:
        x1, y1 = xy(a)
        x2, y2 = xy(b)
        edge_id = html.escape(f"{a}-{b}")
        lines.append(
            f'<line data-edge="{edge_id}" x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" '
            f'stroke="black" stroke-width="{line_width:.3f}" stroke-linecap="round"/>'
        )

    for node in problem["nodes"]:
        node_id = node["id"]
        x, y = xy(node_id)
        escaped_id = html.escape(node_id)
        lines.append(
            f'<circle data-node-id="{escaped_id}" cx="{x:.3f}" cy="{y:.3f}" r="{radius:.3f}" '
            f'fill="white" stroke="black" stroke-width="{circle_stroke:.3f}"/>'
        )
        value = node.get("answer") if show_answers else node.get("given")
        if value is not None:
            text = html.escape(str(value))
            font_size = radius * (1.18 if len(text) == 1 else 0.9)
            lines.append(
                f'<text data-node-label="{escaped_id}" x="{x:.3f}" y="{(y + font_size * 0.34):.3f}" '
                f'text-anchor="middle" font-family="sans-serif" font-size="{font_size:.3f}" '
                f'font-weight="700">{text}</text>'
            )

    lines.append("</svg>")
    return "\n".join(lines)
