import assert from "node:assert/strict";
import { solvePuzzle } from "../domain/solver/solve-puzzle.ts";

const boardSizes = [
  { width: 3, height: 3 },
  { width: 4, height: 3 },
];
let checkedPlacementCount = 0;

for (const { width, height } of boardSizes) {
  const cellCount = width * height;
  for (const terminalIndices of combinations(
    [...Array.from({ length: cellCount }).keys()],
    4,
  )) {
    const puzzle = {
      schemaVersion: "onaji-no-tsunagi.puzzle.v1",
      puzzleId: `oracle-${width}x${height}-${terminalIndices.join("-")}`,
      width,
      height,
      terminals: terminalIndices.map((index, terminalIndex) => ({
        terminalId: `terminal-${terminalIndex + 1}`,
        symbol: "circle",
        row: Math.floor(index / width),
        column: index % width,
      })),
    };
    const oracleHashes = enumerateSolutionHashes(puzzle);
    const productionHashes = new Set();
    const result = solvePuzzle(puzzle, {
      solutionLimit: Number.MAX_SAFE_INTEGER,
      stateBudget: 2_000_000,
      solutionObserver(solution) {
        productionHashes.add(independentSolutionHash(solution, width));
      },
    });

    assert.notEqual(
      result.status,
      "budget_exhausted",
      `${puzzle.puzzleId}: production solver exhausted its state budget`,
    );
    const productionSolutionCount = result.status === "unsatisfiable"
      ? 0
      : result.solutionCount.count;
    assert.equal(
      result.status === "solved"
        ? result.solutionCount.kind
        : "exact",
      "exact",
      `${puzzle.puzzleId}: production solver stopped before full enumeration`,
    );
    assert.equal(
      productionSolutionCount,
      productionHashes.size,
      `${puzzle.puzzleId}: observer hashes do not match the reported count`,
    );
    assert.deepEqual(
      [...productionHashes].toSorted(),
      [...oracleHashes].toSorted(),
      `${puzzle.puzzleId}: independent oracle solution hashes differ`,
    );
    checkedPlacementCount += 1;
  }
}

assert.equal(checkedPlacementCount, 621);
console.log(
  `onaji-no-tsunagi independent solver oracle checked ${checkedPlacementCount} placements`,
);

function enumerateSolutionHashes(puzzle) {
  const terminalIndices = puzzle.terminals.map(
    (terminal) => terminal.row * puzzle.width + terminal.column,
  );
  const terminalIndexSet = new Set(terminalIndices);
  const pathCache = new Map();
  const hashes = new Set();

  for (const pairs of enumeratePerfectMatchings(terminalIndices)) {
    const candidatesByPair = pairs.map(([first, second]) => ({
      pair: [first, second],
      paths: pathsForPair(first, second),
    }));
    chooseDisjointPaths(candidatesByPair, 0n, []);
  }
  return hashes;

  function pathsForPair(first, second) {
    const key = first < second ? `${first}:${second}` : `${second}:${first}`;
    const cached = pathCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const paths = [];
    walk(first, 1n << BigInt(first), [first]);
    pathCache.set(key, paths);
    return paths;

    function walk(current, visited, path) {
      if (current === second) {
        paths.push({ cells: path, mask: visited });
        return;
      }
      for (const next of adjacentCellIndices(
        current,
        puzzle.width,
        puzzle.height,
      )) {
        const bit = 1n << BigInt(next);
        if ((visited & bit) !== 0n) {
          continue;
        }
        if (
          terminalIndexSet.has(next)
          && next !== first
          && next !== second
        ) {
          continue;
        }
        walk(next, visited | bit, [...path, next]);
      }
    }
  }

  function chooseDisjointPaths(remainingPairs, occupied, selectedPaths) {
    if (remainingPairs.length === 0) {
      const solution = {
        paths: selectedPaths.map((cells) => ({
          symbol: "circle",
          cells: cells.map((index) => ({
            row: Math.floor(index / puzzle.width),
            column: index % puzzle.width,
          })),
        })),
      };
      hashes.add(independentSolutionHash(solution, puzzle.width));
      return;
    }

    const compatibleByPair = remainingPairs.map((entry) => ({
      entry,
      compatiblePaths: entry.paths.filter(
        (path) => (path.mask & occupied) === 0n,
      ),
    }));
    compatibleByPair.sort(
      (left, right) => (
        left.compatiblePaths.length - right.compatiblePaths.length
        || left.entry.pair[0] - right.entry.pair[0]
        || left.entry.pair[1] - right.entry.pair[1]
      ),
    );
    const selectedPair = compatibleByPair[0];
    if (selectedPair === undefined) {
      return;
    }
    const nextPairs = remainingPairs.filter(
      (entry) => entry !== selectedPair.entry,
    );
    for (const path of selectedPair.compatiblePaths) {
      chooseDisjointPaths(
        nextPairs,
        occupied | path.mask,
        [...selectedPaths, path.cells],
      );
    }
  }
}

function enumeratePerfectMatchings(values) {
  if (values.length === 0) {
    return [[]];
  }
  const first = values[0];
  assert.notEqual(first, undefined);
  const matchings = [];
  for (let partnerIndex = 1; partnerIndex < values.length; partnerIndex += 1) {
    const partner = values[partnerIndex];
    assert.notEqual(partner, undefined);
    const remaining = values.filter(
      (_, index) => index !== 0 && index !== partnerIndex,
    );
    for (const matching of enumeratePerfectMatchings(remaining)) {
      matchings.push([[first, partner], ...matching]);
    }
  }
  return matchings;
}

function independentSolutionHash(solution, width) {
  return solution.paths
    .map((path) => {
      const forward = path.cells.map(
        (cell) => cell.row * width + cell.column,
      );
      const reverse = [...forward].reverse();
      const normalized = compareNumberLists(reverse, forward) < 0
        ? reverse
        : forward;
      return { symbol: path.symbol, cells: normalized };
    })
    .toSorted(
      (left, right) => (
        left.symbol.localeCompare(right.symbol)
        || compareNumberLists(left.cells, right.cells)
      ),
    )
    .map((path) => `${path.symbol}:${path.cells.join(".")}`)
    .join("|");
}

function adjacentCellIndices(index, width, height) {
  const row = Math.floor(index / width);
  const column = index % width;
  const result = [];
  if (row > 0) {
    result.push(index - width);
  }
  if (column > 0) {
    result.push(index - 1);
  }
  if (column + 1 < width) {
    result.push(index + 1);
  }
  if (row + 1 < height) {
    result.push(index + width);
  }
  return result;
}

function combinations(values, size) {
  const result = [];
  choose(0, []);
  return result;

  function choose(start, selected) {
    if (selected.length === size) {
      result.push(selected);
      return;
    }
    const needed = size - selected.length;
    for (let index = start; index <= values.length - needed; index += 1) {
      const value = values[index];
      assert.notEqual(value, undefined);
      choose(index + 1, [...selected, value]);
    }
  }
}

function compareNumberLists(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}
