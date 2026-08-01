/**
 * Web WorkerによるWorksheet生成の開始、結果状態、unmount時の終了処理を管理する。
 *
 * 画面表示やフォーム状態からWorker lifecycleを分離し、UI componentが
 * 生成中・成功・失敗の表示判断だけを行えるようにする。
 *
 * @packageDocumentation
 */

import {useEffect, useRef, useState} from 'react';
import type {
  GenerationWorkerRequest,
  GenerationWorkerResponse,
} from '../application/generation-worker-contract.ts';
import type {Worksheet} from '../domain/types/worksheet.ts';
import type {GenerationError} from '../domain/types/generation.ts';

/** Worksheet生成画面が表示する非同期処理状態。 @internal */
export type WorksheetGenerationState =
  | {readonly status: 'idle'}
  | {readonly status: 'generating'}
  | {readonly status: 'ready'; readonly worksheet: Worksheet}
  | {
      readonly status: 'error';
      readonly message: string;
      readonly report?: GenerationError;
    };

interface WorksheetGenerationController {
  /** 現在のWorker実行状態または生成結果。 */
  readonly state: WorksheetGenerationState;
  /** 未検証のフォーム入力をWorkerへ送り、完了時に`state`を更新する。 */
  readonly generate: (input: unknown) => Promise<void>;
}

interface PendingWorkerGeneration {
  readonly result: Promise<Worksheet>;
  readonly cancel: () => void;
}

interface ActiveWorkerGeneration {
  readonly requestId: number;
  readonly pending: PendingWorkerGeneration;
}

/**
 * 一度に一つの生成Workerを管理し、画面向け状態と開始関数を返す。
 *
 * 新しい生成を開始すると前のWorkerと待機中Promiseを終了する。要求IDが最新で
 * ない成功・失敗は破棄するため、古い応答が新しい画面状態を上書きしない。
 *
 * @internal
 */
export function useWorksheetGeneration(): WorksheetGenerationController {
  const [state, setState] = useState<WorksheetGenerationState>({
    status: 'idle',
  });
  const latestRequestId = useRef(0);
  const activeGeneration = useRef<ActiveWorkerGeneration | null>(null);

  useEffect(
    () => () => {
      latestRequestId.current += 1;
      activeGeneration.current?.pending.cancel();
      activeGeneration.current = null;
    },
    [],
  );

  async function generate(input: unknown): Promise<void> {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    activeGeneration.current?.pending.cancel();
    activeGeneration.current = null;
    setState({status: 'generating'});

    try {
      const pending = startWorksheetGeneration(requestId, input);
      activeGeneration.current = {requestId, pending};
      const worksheet = await pending.result;
      if (latestRequestId.current !== requestId) {
        return;
      }
      setState({status: 'ready', worksheet});
    } catch (error: unknown) {
      if (
        latestRequestId.current !== requestId ||
        error instanceof SupersededGenerationError
      ) {
        return;
      }
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : '不明なエラーです。',
        ...(error instanceof WorkerGenerationError && error.report !== undefined
          ? {report: error.report}
          : {}),
      });
    } finally {
      if (activeGeneration.current?.requestId === requestId) {
        activeGeneration.current = null;
      }
    }
  }

  return {state, generate};
}

function startWorksheetGeneration(
  requestId: number,
  input: unknown,
): PendingWorkerGeneration {
  const worker = new Worker(
    new URL('../application/generation-worker.ts', import.meta.url),
    {type: 'module'},
  );
  let settled = false;
  let rejectPending: (reason: Error) => void = () => {};
  const result = new Promise<Worksheet>((resolve, reject) => {
    rejectPending = reject;
    worker.addEventListener(
      'message',
      (event: MessageEvent<GenerationWorkerResponse>) => {
        const response = event.data;
        if (response.requestId !== requestId) {
          return;
        }
        if (response.status === 'ready') {
          const {worksheet} = response;
          settle(() => resolve(worksheet));
        } else {
          const {message, report} = response;
          console.error('[onaji-no-tsunagi] worksheet generation failed', {
            requestId,
            message,
            ...(report === undefined ? {} : {report}),
          });
          settle(() => reject(new WorkerGenerationError(message, report)));
        }
      },
    );
    worker.addEventListener(
      'error',
      () => {
        settle(() =>
          reject(
            new Error(
              '生成処理を開始できませんでした。ページを再読み込みしてください。',
            ),
          ),
        );
      },
      {once: true},
    );
    const request: GenerationWorkerRequest = {requestId, input};
    worker.postMessage(request);
  });

  return {
    result,
    cancel: () => {
      settle(() => rejectPending(new SupersededGenerationError()));
    },
  };

  function settle(complete: () => void): void {
    if (settled) {
      return;
    }
    settled = true;
    worker.terminate();
    complete();
  }
}

class SupersededGenerationError extends Error {
  constructor() {
    super('A newer worksheet generation request superseded this request.');
    this.name = 'SupersededGenerationError';
  }
}

class WorkerGenerationError extends Error {
  readonly report: GenerationError | undefined;

  constructor(message: string, report?: GenerationError) {
    super(message);
    this.name = 'WorkerGenerationError';
    this.report = report;
  }
}
