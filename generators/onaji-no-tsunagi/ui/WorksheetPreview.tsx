import type { Worksheet } from "../domain/types/worksheet.ts";
import { PuzzleBoard } from "./PuzzleBoard.tsx";

export function WorksheetPreview({ worksheet }: { readonly worksheet: Worksheet }) {
  const large = worksheet.request.difficulty >= 2;
  if (large) {
    return (
      <>
        {worksheet.puzzles.map((generated, index) => {
          const headingId = `ots-problem-heading-${index + 1}`;
          return (
            <section
              className="ots-sheet ots-problem-sheet ots-single-puzzle-sheet"
              aria-labelledby={headingId}
              key={generated.puzzle.puzzleId}
            >
              <SheetHeader
                headingId={headingId}
                title="おなじのつなぎ"
                seed={worksheet.request.seed}
              />
              <ProblemInstructions />
              <div className="ots-worksheet-grid ots-worksheet-grid--large">
                <ProblemCard
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
    <section className="ots-sheet ots-problem-sheet" aria-labelledby="ots-problem-heading">
      <SheetHeader
        headingId="ots-problem-heading"
        title="おなじのつなぎ"
        seed={worksheet.request.seed}
      />
      <ProblemInstructions />
      <div className="ots-worksheet-grid">
        {worksheet.puzzles.map((generated, index) => (
          <ProblemCard
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

function ProblemInstructions() {
  return (
    <>
      <p className="ots-instruction">
        同じ形のマークを、2こずつ線でつなぎましょう。線は上下左右に進み、
        1つのマスには1本の線だけ通せます。すべてのマークを1回ずつ使います。
        同じ形が4こ以上あるときも、2こずつのペアを作ります。
      </p>
      <p className="ots-thinking-hint">
        一本つないだら、ほかのマークにも道が残っているか見てみよう。
      </p>
    </>
  );
}

function ProblemCard({
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
        <h3>問題 {index + 1}</h3>
        <DifficultyStars level={level} />
      </div>
      <PuzzleBoard puzzle={generated.puzzle} solution={null} mode="problem" />
      <p className="ots-puzzle-id">{generated.puzzle.puzzleId}</p>
    </article>
  );
}

export function SheetHeader({
  headingId,
  title,
  seed,
}: {
  readonly headingId: string;
  readonly title: string;
  readonly seed: string;
}) {
  return (
    <header className="ots-sheet-header">
      <div>
        <p className="ots-sheet-kicker">算数パズル</p>
        <h2 id={headingId}>{title}</h2>
      </div>
      <div className="ots-student-fields" aria-label="名前と日付の記入欄">
        <span>なまえ</span><i />
        <span>ひづけ</span><i />
      </div>
      <p className="ots-sheet-seed">seed: {shortSeed(seed)}</p>
    </header>
  );
}

export function DifficultyStars({ level }: { readonly level: 1 | 2 | 3 | 4 }) {
  return (
    <span className="ots-stars" aria-label={`暫定難易度${level}`}>
      {Array.from({ length: 4 }, (_, index) => (
        <span aria-hidden="true" key={index}>{index < level ? "★" : "☆"}</span>
      ))}
    </span>
  );
}

function shortSeed(seed: string): string {
  return seed.length <= 24 ? seed : `${seed.slice(0, 21)}...`;
}
