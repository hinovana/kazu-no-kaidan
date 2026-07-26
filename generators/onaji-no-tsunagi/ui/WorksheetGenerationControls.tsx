/**
 * 難易度、問題数、seedと、生成・答案表示・印刷操作を表示する。
 *
 * 入力状態の保持や生成処理を行わず、親componentから受け取った状態と操作を
 * form controlへ対応付ける。
 *
 * @packageDocumentation
 */

import type {
  AcceptedDifficultyClassification,
  AvailableDifficultyLevel,
  PuzzleCount,
} from '../domain/types/generation.ts';
import {ACCEPTABLE_DIFFICULTY_CLASSIFICATIONS} from '../domain/types/generation.ts';

/** Worksheet生成フォームで編集する値。 @internal */
export interface WorksheetGenerationForm {
  readonly difficulty: AvailableDifficultyLevel;
  readonly puzzleCount: PuzzleCount;
  readonly seed: string;
  readonly acceptedDifficultyClassifications: readonly AcceptedDifficultyClassification[];
}

interface WorksheetGenerationControlsProps {
  readonly form: WorksheetGenerationForm;
  readonly generating: boolean;
  readonly hasWorksheet: boolean;
  readonly showAnswers: boolean;
  readonly onChange: (form: WorksheetGenerationForm) => void;
  readonly onGenerate: () => Promise<void>;
  readonly onToggleAnswers: () => void;
  readonly onPrint: () => void;
}

/** Worksheet生成画面の入力・操作panel。 @internal */
export function WorksheetGenerationControls({
  form,
  generating,
  hasWorksheet,
  showAnswers,
  onChange,
  onGenerate,
  onToggleAnswers,
  onPrint,
}: WorksheetGenerationControlsProps) {
  const selectionPolicyCanApply = form.difficulty === 2;
  const noClassificationSelected =
    form.acceptedDifficultyClassifications.length === 0;
  return (
    <form
      className="ots-control-panel screen-only"
      onSubmit={event => {
        event.preventDefault();
        void onGenerate();
      }}
    >
      <div className="ots-control-grid">
        <label>
          暫定難易度
          <select
            value={form.difficulty}
            onChange={event =>
              onChange({
                ...form,
                difficulty: parseDifficultyOption(event.target.value),
              })
            }
          >
            <option value={1}>★☆☆☆ レベル1（5×5・6/8/10個・唯一解）</option>
            <option value={2}>★★☆☆ レベル2（6×6・10/12個・唯一解）</option>
            <option value={3}>★★★☆ レベル3（6×6・14個・唯一解）</option>
          </select>
        </label>
        <label>
          問題数
          <select
            value={form.puzzleCount}
            onChange={event =>
              onChange({
                ...form,
                puzzleCount: parsePuzzleCountOption(event.target.value),
              })
            }
          >
            {[1, 2, 3, 4].map(count => (
              <option value={count} key={count}>
                {count}問
              </option>
            ))}
          </select>
        </label>
        <label className="ots-seed-field">
          seed
          <input
            value={form.seed}
            maxLength={200}
            onChange={event =>
              onChange({
                ...form,
                seed: event.target.value,
              })
            }
          />
        </label>
        <button
          className="ots-secondary-button"
          type="button"
          onClick={() => onChange({...form, seed: createRandomSeed()})}
        >
          ランダムseed
        </button>
      </div>
      <p className="ots-control-note">
        生成した問題は、同じ形が4個以上ある場合のペアリングも含め、
        答えが1通りだけであることを完全探索で確認します。
      </p>
      <fieldset
        className="ots-selection-criteria"
        disabled={!selectionPolicyCanApply || generating}
      >
        <legend>6×6・10端点の採用基準</legend>
        <div className="ots-selection-options">
          {ACCEPTABLE_DIFFICULTY_CLASSIFICATIONS.map(classification => (
            <label key={classification}>
              <input
                type="checkbox"
                checked={form.acceptedDifficultyClassifications.includes(
                  classification,
                )}
                onChange={() =>
                  onChange({
                    ...form,
                    acceptedDifficultyClassifications: toggleClassification(
                      form.acceptedDifficultyClassifications,
                      classification,
                    ),
                  })
                }
              />
              {difficultyClassificationLabel(classification)}
            </label>
          ))}
        </div>
        <p className="ots-control-note">
          現在は6×6・10端点だけに適用します。「明らかに簡単側」は選択肢に
          関係なく再生成します。
        </p>
        {selectionPolicyCanApply && noClassificationSelected ? (
          <p className="ots-form-error" role="alert">
            採用基準を1つ以上選んでください。
          </p>
        ) : null}
      </fieldset>
      <div className="ots-action-row">
        <button
          className="ots-primary-button"
          type="submit"
          disabled={
            generating || (selectionPolicyCanApply && noClassificationSelected)
          }
        >
          {generating ? '作っています…' : 'この条件でつくる'}
        </button>
        {hasWorksheet ? (
          <>
            <button
              className="ots-secondary-button"
              type="button"
              onClick={onToggleAnswers}
            >
              {showAnswers ? '答えを隠す' : '答えを表示'}
            </button>
            <button
              className="ots-secondary-button"
              type="button"
              onClick={onPrint}
            >
              印刷
            </button>
          </>
        ) : null}
      </div>
    </form>
  );
}

function toggleClassification(
  selected: readonly AcceptedDifficultyClassification[],
  target: AcceptedDifficultyClassification,
): readonly AcceptedDifficultyClassification[] {
  const next = new Set(selected);
  if (next.has(target)) {
    next.delete(target);
  } else {
    next.add(target);
  }
  return ACCEPTABLE_DIFFICULTY_CLASSIFICATIONS.filter(classification =>
    next.has(classification),
  );
}

function difficultyClassificationLabel(
  classification: AcceptedDifficultyClassification,
): string {
  if (classification === 'reference_like') {
    return '原本近傍';
  }
  if (classification === 'clearly_harder') {
    return '明らかに難しい側';
  }
  return '指標混合';
}

function createRandomSeed(): string {
  const values = new Uint32Array(2);
  globalThis.crypto.getRandomValues(values);
  return `onaji-${[...values].map(value => value.toString(36)).join('-')}`;
}

function parseDifficultyOption(value: string): AvailableDifficultyLevel {
  if (value === '1') {
    return 1;
  }
  if (value === '2') {
    return 2;
  }
  if (value === '3') {
    return 3;
  }
  throw new RangeError('unsupported difficulty option');
}

function parsePuzzleCountOption(value: string): PuzzleCount {
  if (value === '1') {
    return 1;
  }
  if (value === '2') {
    return 2;
  }
  if (value === '3') {
    return 3;
  }
  if (value === '4') {
    return 4;
  }
  throw new RangeError('unsupported puzzle count option');
}
