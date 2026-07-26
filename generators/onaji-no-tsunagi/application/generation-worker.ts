/**
 * Worksheet生成をメインスレッド外で実行するWeb Workerの入口。
 *
 * 未検証入力を受信し、applicationユースケースの結果を構造化clone可能な応答として返す。
 *
 * @packageDocumentation
 */

import type {
  GenerationWorkerRequest,
  GenerationWorkerResponse,
} from './generation-worker-contract.ts';
import {generationErrorMessage} from './generation-error-message.ts';
import {generateWorksheetUseCase} from './generate-worksheet-use-case.ts';

self.addEventListener(
  'message',
  (event: MessageEvent<GenerationWorkerRequest>) => {
    const {requestId, input} = event.data;
    let response: GenerationWorkerResponse;
    try {
      response = {
        requestId,
        status: 'ready',
        worksheet: generateWorksheetUseCase(input),
      };
    } catch (error: unknown) {
      response = {
        requestId,
        status: 'error',
        message: generationErrorMessage(error),
      };
    }
    self.postMessage(response);
  },
);
