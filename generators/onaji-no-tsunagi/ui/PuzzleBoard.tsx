/**
 * Puzzleと任意のSolutionを、画面・印刷共通のSVG盤面として描画する。
 *
 * 問題用では端点だけを、答案用では端点と解答経路を表示する。
 *
 * @packageDocumentation
 */

import type {Puzzle, Terminal} from '../domain/types/puzzle.ts';
import type {Solution} from '../domain/types/solution.ts';
import {symbolLabel} from './symbol-label.ts';

interface PuzzleBoardProps {
  readonly puzzle: Puzzle;
  readonly solution: Solution | null;
  readonly mode: 'problem' | 'answer';
  readonly showCoordinates?: boolean;
}

const CELL_SIZE = 100;
const MARKER_RADIUS = 27;

/**
 * 問題と答えで共有するSVG盤面component。
 *
 * @remarks
 * 問題面へ答え線を埋め込まないため、`mode: "problem"`では呼出側が
 * `solution: null`を渡す。`showCoordinates`は原本転記の開発確認専用である。
 */
export function PuzzleBoard({
  puzzle,
  solution,
  mode,
  showCoordinates = false,
}: PuzzleBoardProps) {
  const width = puzzle.width * CELL_SIZE;
  const height = puzzle.height * CELL_SIZE;
  const gridColumns = indexSequence(puzzle.width + 1);
  const gridRows = indexSequence(puzzle.height + 1);
  return (
    <svg
      className="ots-puzzle-board"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${puzzle.width}列${puzzle.height}行、マーク${puzzle.terminals.length}個の${mode === 'answer' ? '答え' : '問題'}盤面`}
      data-mode={mode}
    >
      <rect
        className="ots-board-background"
        x="1"
        y="1"
        width={width - 2}
        height={height - 2}
      />
      {gridColumns.map(column => (
        <line
          className="ots-grid-line"
          key={`column-${column}`}
          x1={column * CELL_SIZE}
          y1={0}
          x2={column * CELL_SIZE}
          y2={height}
        />
      ))}
      {gridRows.map(row => (
        <line
          className="ots-grid-line"
          key={`row-${row}`}
          x1={0}
          y1={row * CELL_SIZE}
          x2={width}
          y2={row * CELL_SIZE}
        />
      ))}
      {showCoordinates
        ? indexSequence(puzzle.height).map(row =>
            indexSequence(puzzle.width).map(column => (
              <text
                className="ots-cell-coordinate"
                key={`coordinate-${row}-${column}`}
                x={column * CELL_SIZE + 8}
                y={row * CELL_SIZE + 19}
              >
                {row},{column}
              </text>
            )),
          )
        : null}
      {solution?.paths.map((path, pathIndex) => (
        <polyline
          className="ots-answer-line"
          key={`path-${pathIndex}`}
          points={path.cells
            .map(
              cell =>
                `${cell.column * CELL_SIZE + CELL_SIZE / 2},${cell.row * CELL_SIZE + CELL_SIZE / 2}`,
            )
            .join(' ')}
        />
      ))}
      {puzzle.terminals.map(terminal => (
        <Marker terminal={terminal} key={terminal.terminalId} />
      ))}
    </svg>
  );
}

function Marker({terminal}: {readonly terminal: Terminal}) {
  const centerX = terminal.column * CELL_SIZE + CELL_SIZE / 2;
  const centerY = terminal.row * CELL_SIZE + CELL_SIZE / 2;
  return (
    <g
      className={`ots-marker ots-marker--${terminal.symbol}`}
      aria-label={symbolLabel(terminal.symbol)}
    >
      {terminal.symbol === 'circle' ? (
        <circle cx={centerX} cy={centerY} r={MARKER_RADIUS} />
      ) : null}
      {terminal.symbol === 'square' ? (
        <rect
          x={centerX - MARKER_RADIUS}
          y={centerY - MARKER_RADIUS}
          width={MARKER_RADIUS * 2}
          height={MARKER_RADIUS * 2}
          rx="3"
        />
      ) : null}
      {terminal.symbol === 'triangle' ? (
        <polygon
          points={[
            `${centerX},${centerY - MARKER_RADIUS - 4}`,
            `${centerX - MARKER_RADIUS - 3},${centerY + MARKER_RADIUS}`,
            `${centerX + MARKER_RADIUS + 3},${centerY + MARKER_RADIUS}`,
          ].join(' ')}
        />
      ) : null}
    </g>
  );
}

function indexSequence(length: number): readonly number[] {
  return [...Array.from({length}).keys()];
}
