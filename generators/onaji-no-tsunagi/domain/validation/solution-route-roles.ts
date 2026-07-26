import { cellKey } from "../grid/coordinates.ts";
import { terminalPairKey } from "../solver/enumerate-pairings.ts";
import type { Puzzle } from "../types/puzzle.ts";
import type { Solution } from "../types/solution.ts";
import type { RouteRoles } from "../types/worksheet.ts";

export function doesSolutionPreserveRouteRoles(
  puzzle: Puzzle,
  solution: Solution,
  roles: RouteRoles,
): boolean {
  const terminalByCell = new Map(
    puzzle.terminals.map((terminal) => [
      cellKey(terminal),
      terminal,
    ] as const),
  );
  const actualPairs = new Set(
    solution.paths.map((path) => {
      const firstCell = path.cells[0];
      const secondCell = path.cells.at(-1);
      if (firstCell === undefined || secondCell === undefined) {
        return "";
      }
      const first = terminalByCell.get(cellKey(firstCell));
      const second = terminalByCell.get(cellKey(secondCell));
      return first === undefined || second === undefined
        ? ""
        : terminalPairKey(first.terminalId, second.terminalId);
    }),
  );
  return [
    roles.spineTerminalIds,
    roles.threadTerminalIds,
    ...roles.scaffoldTerminalIdPairs,
  ].every((pair) => actualPairs.has(terminalPairKey(...pair)));
}
