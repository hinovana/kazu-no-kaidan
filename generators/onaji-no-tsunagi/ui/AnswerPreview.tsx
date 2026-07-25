import type { Worksheet } from "../domain/types/worksheet.ts";
import { PuzzleBoard } from "./PuzzleBoard.tsx";
import { DifficultyStars, SheetHeader } from "./WorksheetPreview.tsx";

export function AnswerPreview({
  worksheet,
  hidden,
}: {
  readonly worksheet: Worksheet;
  readonly hidden: boolean;
}) {
  const large = worksheet.request.difficulty >= 2;
  const hiddenClass = hidden ? " ots-answer-screen-hidden" : "";
  if (large) {
    return (
      <>
        {worksheet.puzzles.map((generated, index) => {
          const headingId = `ots-answer-heading-${index + 1}`;
          return (
            <section
              className={`ots-sheet ots-answer-sheet ots-single-puzzle-sheet${hiddenClass}`}
              aria-labelledby={headingId}
              key={generated.puzzle.puzzleId}
            >
              <SheetHeader
                headingId={headingId}
                title="おなじのつなぎ 答え"
                seed={worksheet.request.seed}
              />
              <AnswerNote />
              <div className="ots-worksheet-grid ots-worksheet-grid--large">
                <AnswerCard
                  generated={generated}
                  index={index}
                  level={worksheet.request.difficulty}
                />
              </div>
            </section>
          );
        })}
      </>
    );
  }

  return (
    <section
      className={`ots-sheet ots-answer-sheet${hiddenClass}`}
      aria-labelledby="ots-answer-heading"
    >
      <SheetHeader
        headingId="ots-answer-heading"
        title="おなじのつなぎ 答え"
        seed={worksheet.request.seed}
      />
      <AnswerNote />
      <div className="ots-worksheet-grid">
        {worksheet.puzzles.map((generated, index) => (
          <AnswerCard
            generated={generated}
            index={index}
            key={generated.puzzle.puzzleId}
            level={worksheet.request.difficulty}
          />
        ))}
      </div>
    </section>
  );
}

function AnswerNote() {
  return (
    <p className="ots-answer-note">
      どの2こを組にするかと線の通り方を含めて、答えは1通りです。
      線をたどる向きや書く順序だけは区別しません。
    </p>
  );
}

function AnswerCard({
  generated,
  index,
  level,
}: {
  readonly generated: Worksheet["puzzles"][number];
  readonly index: number;
  readonly level: 1 | 2 | 3 | 4;
}) {
  return (
    <article className="ots-puzzle-card">
      <div className="ots-puzzle-card-heading">
        <h3>問題 {index + 1} の答え</h3>
        <DifficultyStars level={level} />
      </div>
      <PuzzleBoard
        puzzle={generated.puzzle}
        solution={generated.canonicalSolution}
        mode="answer"
      />
      <p className="ots-puzzle-id">
        {generated.puzzle.puzzleId} / 唯一解・完全探索確認済み
      </p>
    </article>
  );
}
