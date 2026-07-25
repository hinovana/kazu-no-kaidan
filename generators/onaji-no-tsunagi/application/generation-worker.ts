import type { GenerationWorkerResponse } from "./generation-worker-contract.ts";
import { generationErrorMessage } from "./generation-error-message.ts";
import { generateWorksheetUseCase } from "./generate-worksheet-use-case.ts";

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  let response: GenerationWorkerResponse;
  try {
    response = {
      status: "ready",
      worksheet: generateWorksheetUseCase(event.data),
    };
  } catch (error: unknown) {
    response = {
      status: "error",
      message: generationErrorMessage(error),
    };
  }
  self.postMessage(response);
});
