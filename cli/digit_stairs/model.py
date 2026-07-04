from __future__ import annotations

import json
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any


ValueMap = dict[str, Fraction]


@dataclass(frozen=True)
class PropagationStep:
    run_id: str
    node_id: str
    value: Fraction
    reason: str


@dataclass(frozen=True)
class PropagationReport:
    values: ValueMap
    steps: list[PropagationStep]
    unresolved: list[str]


def load_problem(path: str | Path) -> dict[str, Any]:
    with Path(path).open(encoding="utf-8") as f:
        problem = json.load(f)
    validate_problem(problem)
    return problem


def nodes_by_id(problem: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {node["id"]: node for node in problem["nodes"]}


def given_values(problem: dict[str, Any]) -> ValueMap:
    values: ValueMap = {}
    for node in problem["nodes"]:
        if "given" in node:
            values[node["id"]] = Fraction(node["given"])
    return values


def answer_values(problem: dict[str, Any]) -> ValueMap:
    return {node["id"]: Fraction(node["answer"]) for node in problem["nodes"]}


def validate_problem(problem: dict[str, Any]) -> None:
    if problem.get("rule", {}).get("type") != "arithmetic_progression_triples":
        raise ValueError("unsupported rule type")

    node_ids = [node["id"] for node in problem["nodes"]]
    if len(node_ids) != len(set(node_ids)):
        raise ValueError("duplicate node id")
    node_set = set(node_ids)

    for edge in problem["edges"]:
        if len(edge) != 2 or any(node_id not in node_set for node_id in edge):
            raise ValueError(f"invalid edge: {edge}")

    for run in problem["runs"]:
        ids = run["nodes"]
        if len(ids) != 3 or any(node_id not in node_set for node_id in ids):
            raise ValueError(f"invalid run: {run}")

    for node in problem["nodes"]:
        if "answer" not in node:
            raise ValueError(f"missing answer for node: {node['id']}")
