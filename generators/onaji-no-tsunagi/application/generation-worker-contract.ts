import type { Worksheet } from "../domain/types/worksheet.ts";

export type GenerationWorkerResponse =
  | {
      readonly status: "ready";
      readonly worksheet: Worksheet;
    }
  | {
      readonly status: "error";
      readonly message: string;
    };
