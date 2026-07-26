import { generateWorksheet } from "../domain/generation/generate-worksheet.ts";
import type { Worksheet } from "../domain/types/worksheet.ts";
import { parseGenerationRequest } from "./parse-generation-request.ts";

export function generateWorksheetUseCase(input: unknown): Worksheet {
  const request = parseGenerationRequest(input);
  return generateWorksheet(request);
}
