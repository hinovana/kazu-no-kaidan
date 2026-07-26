/**
 * Worksheet生成をメインスレッド外で実行するWeb Workerの入口。
 *
 * 未検証入力を受信し、applicationユースケースの結果を構造化clone可能な応答として返す。
 *
 * @packageDocumentation
 */

import type {GenerationWorkerResponse} from './generation-worker-contract.ts';
import {generationErrorMessage} from './generation-error-message.ts';
import {generateWorksheetUseCase} from './generate-worksheet-use-case.ts';

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  let response: GenerationWorkerResponse;
  try {
    response = {
      status: 'ready',
      worksheet: generateWorksheetUseCase(event.data),
    };
  } catch (error: unknown) {
    response = {
      status: 'error',
      message: generationErrorMessage(error),
    };
  }
  self.postMessage(response);
});
