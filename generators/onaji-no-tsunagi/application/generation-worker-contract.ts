/**
 * Worksheet生成Web WorkerとReact UIの間で交換するメッセージ型を定義する。
 *
 * @packageDocumentation
 */

import type {Worksheet} from '../domain/types/worksheet.ts';

/**
 * 生成WorkerからReact UIへ返す、構造化clone可能な応答。
 *
 * domain例外そのものはWorker境界を越えず、`error`の表示文へ変換される。
 */
export type GenerationWorkerResponse =
  | {
      readonly status: 'ready';
      readonly worksheet: Worksheet;
    }
  | {
      readonly status: 'error';
      readonly message: string;
    };
