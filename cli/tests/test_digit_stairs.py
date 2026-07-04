from __future__ import annotations

import argparse
import sys
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "problem_models"
sys.path.insert(0, str(ROOT))

from digit_stairs import (
    answer_values,
    linear_solution,
    load_problem,
    render_svg,
    solve_without_branching,
)
from digit_stairs.terminal import (
    format_diagram,
    format_solution_explanation,
    id_labels,
    print_solution,
)


SELECTED_PROBLEM_PATHS: list[Path] | None = None


def _default_problem_paths() -> list[Path]:
    return sorted(
        MODEL_DIR.glob("problem*.json"),
        key=lambda path: int(path.stem.removeprefix("problem")),
    )


def _problem_paths() -> list[Path]:
    if SELECTED_PROBLEM_PATHS is not None:
        return SELECTED_PROBLEM_PATHS
    return _default_problem_paths()


def _parse_cli_args(argv: list[str]) -> tuple[list[Path], list[str]]:
    parser = argparse.ArgumentParser(
        description="Validate and display digit-stairs problem JSON files."
    )
    parser.add_argument(
        "json_files",
        nargs="*",
        type=Path,
        help="problem JSON file(s). If omitted, all problem_models/problem*.json files are used.",
    )
    args, unittest_args = parser.parse_known_args(argv)

    paths = args.json_files or _default_problem_paths()
    resolved_paths = [path if path.is_absolute() else Path.cwd() / path for path in paths]
    missing_paths = [path for path in resolved_paths if not path.exists()]
    if missing_paths:
        parser.error("JSON file not found: " + ", ".join(str(path) for path in missing_paths))

    return resolved_paths, unittest_args


class DigitStairsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.problems = [load_problem(path) for path in _problem_paths()]

    def test_problems_have_unique_solution(self) -> None:
        for problem in self.problems:
            with self.subTest(problem=problem["problem_no"]):
                unique, solution = linear_solution(problem)
                self.assertTrue(unique)
                self.assertEqual(solution, answer_values(problem))

    def test_problems_solve_without_branching(self) -> None:
        for problem in self.problems:
            with self.subTest(problem=problem["problem_no"]):
                report = solve_without_branching(problem)
                self.assertEqual(report.unresolved, [])
                self.assertEqual(report.values, answer_values(problem))

    def test_svgs_are_generated_from_models(self) -> None:
        for problem in self.problems:
            with self.subTest(problem=problem["problem_no"]):
                svg = render_svg(problem)
                given_count = sum(1 for node in problem["nodes"] if "given" in node)
                self.assertIn("<svg", svg)
                self.assertEqual(svg.count("data-node-id="), len(problem["nodes"]))
                self.assertEqual(svg.count("data-edge="), len(problem["edges"]))
                self.assertEqual(svg.count("data-node-label="), given_count)

    def test_svg_title_includes_problem_marker(self) -> None:
        for problem in self.problems:
            with self.subTest(problem=problem["problem_no"]):
                svg = render_svg(problem)
                marker = chr(0x2460 + int(problem["problem_no"]) - 1)
                self.assertIn(f"{problem['title']}\u3000{marker}", svg)
                self.assertNotIn('cx="24" cy="38"', svg)

    def test_terminal_diagrams_use_id_map_and_blank_initials(self) -> None:
        for problem in self.problems:
            with self.subTest(problem=problem["problem_no"]):
                id_map = format_diagram(problem, id_labels(problem))
                initial = format_diagram(problem)
                blank_ids = [node["id"] for node in problem["nodes"] if "given" not in node]
                given_ids = [node["id"] for node in problem["nodes"] if "given" in node]

                self.assertNotIn("□", initial)
                self.assertIn("[  ]", initial)
                for node_id in blank_ids[:3]:
                    self.assertIn(f"[{node_id}]", id_map)
                    self.assertNotIn(f"[{node_id}]", initial)
                for node_id in given_ids[:3]:
                    self.assertIn(f"[{node_id}]", id_map)

    def test_solution_explanation_is_generated_from_steps(self) -> None:
        for problem in self.problems:
            with self.subTest(problem=problem["problem_no"]):
                report = solve_without_branching(problem)
                explanation = format_solution_explanation(problem, report)

                self.assertIn("最初の手がかり", explanation)
                self.assertIn(report.steps[0].node_id, explanation)
                self.assertIn("あてずっぽう", explanation)
                self.assertNotRegex(explanation, r"\br\d+\b")

    def test_print_solution_section_order(self) -> None:
        problem = self.problems[0]
        report = solve_without_branching(problem)
        output = StringIO()

        with redirect_stdout(output):
            print_solution(problem, report)

        text = output.getvalue()
        sections = [
            "[IDマップ]",
            "[初期配置]",
            "[解答]",
            "[あてずっぽう無しの確定順]",
            "[解き方]",
            "[判定]",
        ]
        positions = [text.index(section) for section in sections]
        self.assertEqual(positions, sorted(positions))
        self.assertIn("[  ]", text)


if __name__ == "__main__":
    SELECTED_PROBLEM_PATHS, unittest_args = _parse_cli_args(sys.argv[1:])
    for path in _problem_paths():
        problem = load_problem(path)
        print_solution(problem, solve_without_branching(problem))
    sys.stdout.flush()
    unittest.main(argv=[sys.argv[0], *unittest_args], verbosity=1)
