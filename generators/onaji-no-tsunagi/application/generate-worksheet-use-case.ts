/**
 * 未検証入力のparseからWorksheet生成までを一つのapplicationユースケースとして提供する。
 *
 * React UIとWeb Workerは、この境界を通して純粋なdomain生成処理を呼び出す。
 *
 * @packageDocumentation
 */

import {generateWorksheet} from '../domain/generation/generate-worksheet.ts';
import type {Worksheet} from '../domain/types/worksheet.ts';
import {parseGenerationRequest} from './parse-generation-request.ts';

/**
 * WorkerとNode側が共有する、未検証入力からWorksheet生成までのapplication境界。
 *
 * @throws `GenerationRequestParseError`
 * 入力が生成条件のruntime契約を満たさない場合。
 *
 * @throws `GenerationFailure`
 * 候補予算内で品質gateを通過できない場合、または内部不変条件が壊れた場合。
 */
export function generateWorksheetUseCase(input: unknown): Worksheet {
  const request = parseGenerationRequest(input);
  return generateWorksheet(request);
}
