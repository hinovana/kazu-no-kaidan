from __future__ import annotations

from fractions import Fraction
from typing import Any

from .model import PropagationReport, PropagationStep, ValueMap, given_values


def _run_value(ids: list[str], values: ValueMap, missing_id: str) -> Fraction:
    a, b, c = ids
    if missing_id == a:
        return 2 * values[b] - values[c]
    if missing_id == b:
        return (values[a] + values[c]) / 2
    if missing_id == c:
        return 2 * values[b] - values[a]
    raise ValueError(f"{missing_id} is not in run {ids}")


def _check_run(ids: list[str], values: ValueMap) -> bool:
    a, b, c = ids
    return values[a] + values[c] == 2 * values[b]


def solve_without_branching(problem: dict[str, Any]) -> PropagationReport:
    values = given_values(problem)
    steps: list[PropagationStep] = []

    while True:
        changed = False
        for run in problem["runs"]:
            ids = run["nodes"]
            missing = [node_id for node_id in ids if node_id not in values]

            if len(missing) == 0:
                if not _check_run(ids, values):
                    raise ValueError(f"contradiction in run {run['id']}")
                continue

            if len(missing) != 1:
                continue

            node_id = missing[0]
            value = _run_value(ids, values, node_id)
            values[node_id] = value
            steps.append(
                PropagationStep(
                    run_id=run["id"],
                    node_id=node_id,
                    value=value,
                    reason="two known values in one arithmetic run",
                )
            )
            changed = True

        if not changed:
            break

    unresolved = [node["id"] for node in problem["nodes"] if node["id"] not in values]
    return PropagationReport(values=values, steps=steps, unresolved=unresolved)


def linear_solution(problem: dict[str, Any]) -> tuple[bool, ValueMap]:
    ids = [node["id"] for node in problem["nodes"]]
    index = {node_id: i for i, node_id in enumerate(ids)}
    rows: list[list[Fraction]] = []

    for run in problem["runs"]:
        row = [Fraction(0) for _ in ids]
        a, b, c = run["nodes"]
        row[index[a]] = Fraction(1)
        row[index[b]] = Fraction(-2)
        row[index[c]] = Fraction(1)
        rows.append(row + [Fraction(0)])

    for node_id, value in given_values(problem).items():
        row = [Fraction(0) for _ in ids]
        row[index[node_id]] = Fraction(1)
        rows.append(row + [value])

    rank = 0
    pivots: list[int] = []
    for col in range(len(ids)):
        pivot = next((r for r in range(rank, len(rows)) if rows[r][col] != 0), None)
        if pivot is None:
            continue
        rows[rank], rows[pivot] = rows[pivot], rows[rank]
        factor = rows[rank][col]
        rows[rank] = [value / factor for value in rows[rank]]
        for r, row in enumerate(rows):
            if r == rank or row[col] == 0:
                continue
            factor = row[col]
            rows[r] = [
                value - factor * pivot_value
                for value, pivot_value in zip(row, rows[rank])
            ]
        pivots.append(col)
        rank += 1

    for row in rows:
        if all(value == 0 for value in row[:-1]) and row[-1] != 0:
            raise ValueError("inconsistent equation system")

    if rank != len(ids):
        return False, {}

    solution = {ids[col]: rows[row_index][-1] for row_index, col in enumerate(pivots)}
    return True, solution
