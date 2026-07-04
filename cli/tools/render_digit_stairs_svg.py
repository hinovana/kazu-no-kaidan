from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from digit_stairs import load_problem, render_svg


def main() -> None:
    parser = argparse.ArgumentParser(description="Render a digit-stairs JSON model to SVG.")
    parser.add_argument("model", type=Path)
    parser.add_argument("--output", "-o", type=Path, required=True)
    parser.add_argument("--show-answers", action="store_true")
    args = parser.parse_args()

    problem = load_problem(args.model)
    args.output.write_text(render_svg(problem, show_answers=args.show_answers), encoding="utf-8")


if __name__ == "__main__":
    main()
