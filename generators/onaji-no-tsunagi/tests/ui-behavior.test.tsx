/**
 * Worksheet生成UIのWorker競合、表示順、印刷前の答案表示を実DOMで検証する。
 *
 * source文字列ではなくReactをjsdomへmountし、利用者操作と非同期応答の順序を
 * 再現する回帰テストである。
 *
 * @packageDocumentation
 */

import {act, createElement} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {
  GenerationWorkerRequest,
  GenerationWorkerResponse,
} from '../application/generation-worker-contract.ts';
import {generateWorksheet} from '../domain/generation/generate-worksheet.ts';
import type {GenerationRequest} from '../domain/types/generation.ts';
import type {Worksheet} from '../domain/types/worksheet.ts';
import {WorksheetGeneratorPage} from '../ui/OnajiNoTsunagiPage.tsx';
import {useWorksheetGeneration} from '../ui/use-worksheet-generation.ts';

describe('おなじのつなぎ生成UI', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('新しい生成が前のWorkerを止め、古い応答を表示しない', async () => {
    await act(async () => {
      root.render(createElement(GenerationHookHarness));
    });

    await click(findButton(container, 'first'));
    const firstWorker = lastWorker();
    const firstRequest = firstWorker.lastRequest();

    await click(findButton(container, 'second'));
    const secondWorker = lastWorker();
    const secondRequest = secondWorker.lastRequest();
    expect(firstWorker.terminated).toBe(true);
    expect(secondRequest.requestId).toBeGreaterThan(firstRequest.requestId);
    expect(container.querySelector('[data-state]')?.textContent).toBe(
      'generating',
    );

    await act(async () => {
      secondWorker.emitMessage({
        requestId: firstRequest.requestId,
        status: 'ready',
        worksheet: worksheetIdentity('wrong-request-id'),
      });
    });
    expect(container.querySelector('[data-state]')?.textContent).toBe(
      'generating',
    );

    await act(async () => {
      firstWorker.emitMessage({
        requestId: firstRequest.requestId,
        status: 'ready',
        worksheet: worksheetIdentity('old-result'),
      });
    });
    expect(container.querySelector('[data-state]')?.textContent).toBe(
      'generating',
    );

    await act(async () => {
      secondWorker.emitMessage({
        requestId: secondRequest.requestId,
        status: 'ready',
        worksheet: worksheetIdentity('latest-result'),
      });
    });
    expect(container.querySelector('[data-state]')?.textContent).toBe(
      'ready:latest-result',
    );
  });

  it('問題の後に答案を保持し、印刷前に答案を画面状態へ反映する', async () => {
    const animationFrameCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    });
    const onRequestPrint = vi.fn();
    await act(async () => {
      root.render(createElement(WorksheetGeneratorPage, {onRequestPrint}));
    });

    const puzzleCountSelect = container.querySelectorAll('select')[1];
    expect(puzzleCountSelect).toBeInstanceOf(HTMLSelectElement);
    await act(async () => {
      if (puzzleCountSelect instanceof HTMLSelectElement) {
        puzzleCountSelect.value = '1';
        puzzleCountSelect.dispatchEvent(new Event('change', {bubbles: true}));
      }
    });
    await act(async () => {
      container
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
    });

    const worker = lastWorker();
    const request = worker.lastRequest();
    const worksheet = generateWorksheet(request.input as GenerationRequest);
    await act(async () => {
      worker.emitMessage({
        requestId: request.requestId,
        status: 'ready',
        worksheet,
      });
    });

    const problemSheet = requiredElement(container, '.ots-problem-sheet');
    const answerSheet = requiredElement(container, '.ots-answer-sheet');
    expect(
      problemSheet.compareDocumentPosition(answerSheet) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(problemSheet.querySelectorAll('.ots-answer-line')).toHaveLength(0);
    expect(
      answerSheet.querySelectorAll('.ots-answer-line').length,
    ).toBeGreaterThan(0);
    expect(answerSheet.classList.contains('ots-answer-screen-hidden')).toBe(
      true,
    );

    await click(findButton(container, '印刷'));
    expect(answerSheet.classList.contains('ots-answer-screen-hidden')).toBe(
      false,
    );
    expect(onRequestPrint).not.toHaveBeenCalled();
    expect(animationFrameCallbacks).toHaveLength(1);

    await flushAnimationFrame(animationFrameCallbacks);
    expect(onRequestPrint).not.toHaveBeenCalled();
    expect(animationFrameCallbacks).toHaveLength(1);
    await flushAnimationFrame(animationFrameCallbacks);
    expect(onRequestPrint).toHaveBeenCalledTimes(1);
  });
});

function GenerationHookHarness() {
  const generation = useWorksheetGeneration();
  const stateText =
    generation.state.status === 'ready'
      ? `ready:${generation.state.worksheet.worksheetId}`
      : generation.state.status;
  return createElement(
    'div',
    null,
    createElement(
      'button',
      {
        type: 'button',
        onClick: () => void generation.generate({seed: 'first'}),
      },
      'first',
    ),
    createElement(
      'button',
      {
        type: 'button',
        onClick: () => void generation.generate({seed: 'second'}),
      },
      'second',
    ),
    createElement('output', {'data-state': true}, stateText),
  );
}

class FakeWorker {
  static instances: FakeWorker[] = [];

  readonly postedMessages: unknown[] = [];
  terminated = false;
  private readonly messageListeners: Array<
    (event: MessageEvent<GenerationWorkerResponse>) => void
  > = [];
  private readonly errorListeners: Array<(event: Event) => void> = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    const callback = listener as EventListener;
    if (type === 'message') {
      this.messageListeners.push(
        callback as (event: MessageEvent<GenerationWorkerResponse>) => void,
      );
    } else if (type === 'error') {
      this.errorListeners.push(callback);
    }
  }

  postMessage(message: unknown): void {
    this.postedMessages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  lastRequest(): GenerationWorkerRequest {
    const request = this.postedMessages.at(-1);
    expect(request).toBeDefined();
    return request as GenerationWorkerRequest;
  }

  emitMessage(response: GenerationWorkerResponse): void {
    const event = new MessageEvent<GenerationWorkerResponse>('message', {
      data: response,
    });
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }
}

function lastWorker(): FakeWorker {
  const worker = FakeWorker.instances.at(-1);
  expect(worker).toBeDefined();
  return worker as FakeWorker;
}

function worksheetIdentity(worksheetId: string): Worksheet {
  return {worksheetId} as Worksheet;
}

function findButton(parent: ParentNode, text: string): HTMLButtonElement {
  const button = [...parent.querySelectorAll('button')].find(
    candidate => candidate.textContent === text,
  );
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

function requiredElement(parent: ParentNode, selector: string): Element {
  const element = parent.querySelector(selector);
  expect(element).not.toBeNull();
  return element as Element;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  });
}

async function flushAnimationFrame(
  callbacks: FrameRequestCallback[],
): Promise<void> {
  const callback = callbacks.shift();
  expect(callback).toBeDefined();
  await act(async () => {
    callback?.(performance.now());
  });
}
