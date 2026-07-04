from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from reportlab.lib.units import mm
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.pdfmetrics import registerFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "problem_models"
sys.path.insert(0, str(ROOT))

from digit_stairs import load_problem, nodes_by_id


JP_FONT = "HeiseiKakuGo-W5"
LATIN_FONT = "Helvetica-Bold"


def _default_model_paths() -> list[Path]:
    return sorted(
        MODEL_DIR.glob("problem*.json"),
        key=lambda path: int(path.stem.removeprefix("problem")),
    )


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


def _page_geometry(problem: dict[str, Any]) -> dict[str, float]:
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

    return {
        "page_w": page_w,
        "page_h": page_h,
        "min_x": min_x,
        "min_y": min_y,
        "scale": scale,
        "offset_x": (page_w - out_w) / 2,
        "offset_y": center_y - out_h / 2,
        "radius": max(4.9, min(8.2, 23.5 * scale)),
        "circle_stroke": max(0.75, min(1.35, 3.1 * scale)),
        "line_width": max(1.3, min(2.8, 7.5 * scale)),
    }


def _draw_page(c: canvas.Canvas, problem: dict[str, Any], *, show_answers: bool) -> None:
    nodes = nodes_by_id(problem)
    geometry = _page_geometry(problem)
    page_h = geometry["page_h"]

    def x_mm(node_id: str) -> float:
        node = nodes[node_id]
        return geometry["offset_x"] + (float(node["x"]) - geometry["min_x"]) * geometry["scale"]

    def y_mm(node_id: str) -> float:
        node = nodes[node_id]
        return geometry["offset_y"] + (float(node["y"]) - geometry["min_y"]) * geometry["scale"]

    def pdf_x(x: float) -> float:
        return x * mm

    def pdf_y(y: float) -> float:
        return (page_h - y) * mm

    c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, geometry["page_w"] * mm, page_h * mm, stroke=0, fill=1)

    c.setFillColorRGB(0, 0, 0)
    c.setFont(JP_FONT, 7.2 * mm)
    c.drawCentredString(pdf_x(geometry["page_w"] / 2), pdf_y(24), _heading(problem))

    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(geometry["line_width"] * mm)
    c.setLineCap(1)
    for a, b in problem["edges"]:
        c.line(pdf_x(x_mm(a)), pdf_y(y_mm(a)), pdf_x(x_mm(b)), pdf_y(y_mm(b)))

    radius = geometry["radius"]
    c.setLineCap(0)
    c.setLineWidth(geometry["circle_stroke"] * mm)
    for node in problem["nodes"]:
        x = x_mm(node["id"])
        y = y_mm(node["id"])
        c.setFillColorRGB(1, 1, 1)
        c.circle(pdf_x(x), pdf_y(y), radius * mm, stroke=1, fill=1)

        value = node.get("answer") if show_answers else node.get("given")
        if value is None:
            continue

        text = str(value)
        font_size = radius * (1.18 if len(text) == 1 else 0.9)
        c.setFillColorRGB(0, 0, 0)
        c.setFont(LATIN_FONT, font_size * mm)
        c.drawCentredString(pdf_x(x), pdf_y(y + font_size * 0.34), text)


def render_pdf(model_paths: list[Path], output_path: Path, *, show_answers: bool = False) -> None:
    problems = [load_problem(path) for path in model_paths]
    if not problems:
        raise ValueError("no problem JSON files found")

    first_geometry = _page_geometry(problems[0])
    c = canvas.Canvas(
        str(output_path),
        pagesize=(first_geometry["page_w"] * mm, first_geometry["page_h"] * mm),
    )
    c.setTitle("digit stairs homework")

    for index, problem in enumerate(problems):
        geometry = _page_geometry(problem)
        c.setPageSize((geometry["page_w"] * mm, geometry["page_h"] * mm))
        _draw_page(c, problem, show_answers=show_answers)
        if index < len(problems) - 1:
            c.showPage()

    c.save()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Render digit-stairs JSON models into one multi-page PDF."
    )
    parser.add_argument(
        "models",
        nargs="*",
        type=Path,
        help="problem JSON files. If omitted, all problem_models/problem*.json files are used.",
    )
    parser.add_argument("--output", "-o", type=Path, required=True)
    parser.add_argument("--show-answers", action="store_true")
    args = parser.parse_args()

    model_paths = args.models or _default_model_paths()
    output_path = args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    registerFont(UnicodeCIDFont(JP_FONT))
    render_pdf(model_paths, output_path, show_answers=args.show_answers)


if __name__ == "__main__":
    main()
