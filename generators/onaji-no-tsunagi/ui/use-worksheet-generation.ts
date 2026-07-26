/**
 * Web WorkerによるWorksheet生成の開始、結果状態、unmount時の終了処理を管理する。
 *
 * 画面表示やフォーム状態からWorker lifecycleを分離し、UI componentが
 * 生成中・成功・失敗の表示判断だけを行えるようにする。
 *
 * @packageDocumentation
 */

import {
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  GenerationWorkerResponse,
} from "../application/generation-worker-contract.ts";
import type { Worksheet } from "../domain/types/worksheet.ts";

/** Worksheet生成画面が表示する非同期処理状態。 @internal */
export type WorksheetGenerationState =
  | { readonly status: "idle" }
  | { readonly status: "generating" }
  | { readonly status: "ready"; readonly worksheet: Worksheet }
  | { readonly status: "error"; readonly message: string };

interface WorksheetGenerationController {
  /** 現在のWorker実行状態または生成結果。 */
  readonly state: WorksheetGenerationState;
  /** 未検証のフォーム入力をWorkerへ送り、完了時に`state`を更新する。 */
  readonly generate: (input: unknown) => Promise<void>;
}

/**
 * 一度に一つの生成Workerを管理し、画面向け状態と開始関数を返す。
 *
 * @internal
 */
export function useWorksheetGeneration(): WorksheetGenerationController {
  const [state, setState] = useState<WorksheetGenerationState>({
    status: "idle",
  });
  const activeWorker = useRef<Worker | null>(null);

  useEffect(() => () => {
    activeWorker.current?.terminate();
  }, []);

  async function generate(input: unknown): Promise<void> {
    setState({ status: "generating" });
    try {
      const worksheet = await generateWorksheetInWorker(
        input,
        (worker) => {
          activeWorker.current = worker;
        },
      );
      setState({ status: "ready", worksheet });
    } catch (error: unknown) {
      setState({
        status: "error",
        message: error instanceof Error
          ? error.message
          : "不明なエラーです。",
      });
    } finally {
      activeWorker.current = null;
    }
  }

  return { state, generate };
}

function generateWorksheetInWorker(
  input: unknown,
  onCreated: (worker: Worker) => void,
): Promise<Worksheet> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../application/generation-worker.ts", import.meta.url),
      { type: "module" },
    );
    onCreated(worker);
    worker.addEventListener("message", (
      event: MessageEvent<GenerationWorkerResponse>,
    ) => {
      worker.terminate();
      if (event.data.status === "ready") {
        resolve(event.data.worksheet);
      } else {
        reject(new Error(event.data.message));
      }
    }, { once: true });
    worker.addEventListener("error", () => {
      worker.terminate();
      reject(new Error(
        "生成処理を開始できませんでした。ページを再読み込みしてください。",
      ));
    }, { once: true });
    worker.postMessage(input);
  });
}
