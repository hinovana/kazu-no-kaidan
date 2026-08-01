/**
 * Worksheet生成Web WorkerとReact UIの間で交換するメッセージ型を定義する。
 *
 * @packageDocumentation
 */

import type {Worksheet} from '../domain/types/worksheet.ts';
import type {GenerationError} from '../domain/types/generation.ts';

/**
 * React UIから生成Workerへ送る、一意な要求ID付きの入力。
 *
 * `input`はWorker内のapplication use caseでruntime検証する。
 */
export interface GenerationWorkerRequest {
  readonly requestId: number;
  readonly input: unknown;
}

/**
 * 生成WorkerからReact UIへ返す、構造化clone可能な応答。
 *
 * `requestId`により、終了要求と入れ違いで届いた古い応答をUIが破棄できる。
 * domain例外そのものはWorker境界を越えず、`error`の表示文へ変換される。
 */
export type GenerationWorkerResponse =
  | {
      readonly requestId: number;
      readonly status: 'ready';
      readonly worksheet: Worksheet;
    }
  | {
      readonly requestId: number;
      readonly status: 'error';
      readonly message: string;
      readonly report?: GenerationError;
    };
