/**
 * 公開domain型を具体的な値へ適用し、TypeScriptの型契約をコンパイル時に検査する。
 *
 * @packageDocumentation
 */

import type {GenerationRequest} from '../domain/types/generation.ts';
import type {Puzzle} from '../domain/types/puzzle.ts';
import type {Solution} from '../domain/types/solution.ts';

const request = {
  difficulty: 1,
  puzzleCount: 2,
  seed: 'typed-contract',
} satisfies GenerationRequest;

const puzzle = {
  schemaVersion: 'onaji-no-tsunagi.puzzle.v1',
  puzzleId: 'typed-puzzle',
  width: 5,
  height: 5,
  terminals: [
    {terminalId: 'a', symbol: 'circle', row: 0, column: 0},
    {terminalId: 'b', symbol: 'circle', row: 0, column: 1},
  ],
} satisfies Puzzle;

const solution = {
  paths: [
    {
      symbol: 'circle',
      cells: [
        {row: 0, column: 0},
        {row: 0, column: 1},
      ],
    },
  ],
} satisfies Solution;

export {puzzle, request, solution};
