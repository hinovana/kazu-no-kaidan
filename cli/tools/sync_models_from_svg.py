from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "problem_models"


def _read_attrs(tag: str) -> dict[str, str]:
    return dict(re.findall(r'([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"', tag))


def _nearest_node_index(nodes: list[dict[str, float]], x: float, y: float) -> int:
    return min(
        range(len(nodes)),
        key=lambda i: (nodes[i]["x"] - x) ** 2 + (nodes[i]["y"] - y) ** 2,
    )


def _svg_path(problem_no: int) -> Path:
    return ROOT / f"2026-06-27_数字の階段_宿題_問題{problem_no}.svg"


def parse_svg(problem_no: int) -> tuple[list[dict[str, float]], list[tuple[int, int]], dict[int, int]]:
    svg = _svg_path(problem_no).read_text(encoding="utf-8")

    nodes: list[dict[str, float]] = []
    for match in re.finditer(r"<circle\b[^>]*/>", svg):
        attrs = _read_attrs(match.group(0))
        cx = float(attrs["cx"])
        cy = float(attrs["cy"])
        if cy < 55:
            continue
        nodes.append({"x": cx, "y": cy})

    nodes.sort(key=lambda node: (round(node["y"], 3), round(node["x"], 3)))

    edges: set[tuple[int, int]] = set()
    for match in re.finditer(r"<line\b[^>]*/>", svg):
        attrs = _read_attrs(match.group(0))
        i = _nearest_node_index(nodes, float(attrs["x1"]), float(attrs["y1"]))
        j = _nearest_node_index(nodes, float(attrs["x2"]), float(attrs["y2"]))
        if i != j:
            edges.add(tuple(sorted((i, j))))

    givens: dict[int, int] = {}
    for match in re.finditer(r"<text\b([^>]*)>([^<]+)</text>", svg):
        attrs = _read_attrs(match.group(1))
        text = match.group(2).strip()
        if not re.fullmatch(r"-?\d+", text):
            continue
        x = float(attrs["x"])
        y = float(attrs["y"])
        if y < 55:
            continue
        idx = _nearest_node_index(nodes, x, y)
        givens[idx] = int(text)

    return nodes, sorted(edges), givens


def sync_model(problem_no: int) -> None:
    model_path = MODEL_DIR / f"problem{problem_no}.json"
    model = json.loads(model_path.read_text(encoding="utf-8"))
    parsed_nodes, parsed_edges, parsed_givens = parse_svg(problem_no)

    existing_nodes = sorted(model["nodes"], key=lambda node: (node["y"], node["x"]))
    if len(existing_nodes) != len(parsed_nodes):
        raise ValueError(
            f"problem {problem_no}: node count mismatch: model={len(existing_nodes)} svg={len(parsed_nodes)}"
        )

    ids_by_parsed_index: list[str] = []
    refreshed_nodes = []
    for index, (old_node, parsed_node) in enumerate(zip(existing_nodes, parsed_nodes)):
        refreshed = {
            "id": old_node["id"],
            "x": parsed_node["x"],
            "y": parsed_node["y"],
        }
        if index in parsed_givens:
            refreshed["given"] = parsed_givens[index]
        refreshed["answer"] = old_node["answer"]
        refreshed_nodes.append(refreshed)
        ids_by_parsed_index.append(old_node["id"])

    model["nodes"] = refreshed_nodes
    model["edges"] = [
        [ids_by_parsed_index[i], ids_by_parsed_index[j]]
        for i, j in parsed_edges
    ]
    model["source_svg"] = str(_svg_path(problem_no).relative_to(ROOT))

    model_path.write_text(
        json.dumps(model, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"problem {problem_no}: synced {len(refreshed_nodes)} nodes, "
        f"{len(model['edges'])} edges, {len(parsed_givens)} givens"
    )


def main() -> None:
    for problem_no in range(1, 7):
        sync_model(problem_no)


if __name__ == "__main__":
    main()
