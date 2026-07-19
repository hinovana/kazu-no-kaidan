import {
  generateWorksheet,
  type LegacyGenerateWorksheetOptions,
} from "../domain/generation/generate-worksheet.ts";
import { parseGenerationRequest } from "./parse-generation-request.ts";
import type { BlueprintId } from "../domain/types/ids.js";
import type { Worksheet } from "../domain/types/worksheet.js";

/**
 * This is the typed application boundary used by the browser. It remains a
 * pure adapter: output changes belong to a
 * separately versioned algorithm change.
 *
 */
export function generateWorksheetFromRequest(input: unknown): Worksheet {
  const request = parseGenerationRequest(input);
  switch (request.source) {
    case "local":
      return generateWorksheet(withOptionalBlueprint(request, {
        grade: request.grade,
        profile: request.profile,
        length: request.length,
        seed: request.seed,
        topic: request.topic,
      }));
    case "local-fallback":
      return generateWorksheet(withOptionalBlueprint(request, {
        grade: request.grade,
        profile: request.profile,
        length: request.length,
        seed: request.seed,
        topic: request.topic,
        sourceMetadata: {
          source: "local_fallback",
          error_code: request.errorCode,
        },
      }));
    case "story-plan.v1":
      return generateWorksheet({
        grade: request.grade,
        profile: request.profile,
        length: request.length,
        seed: request.seed,
        topic: request.topic,
        storyPlan: request.storyPlan,
        sourceMetadata: {
          source: "ai_proxy",
          candidate_id: request.sourceMetadata.candidateId,
          request_id: request.sourceMetadata.requestId,
          model: request.sourceMetadata.model,
          prompt_version: request.sourceMetadata.promptVersion,
          prompt_hash: request.sourceMetadata.promptHash,
          context_version: request.sourceMetadata.contextVersion,
        },
      });
    default:
      return assertNever(request);
  }
}

function withOptionalBlueprint(
  request: { readonly blueprintId?: BlueprintId },
  options: LegacyGenerateWorksheetOptions,
): LegacyGenerateWorksheetOptions {
  return request.blueprintId === undefined ? options : { ...options, blueprintId: request.blueprintId };
}

function assertNever(value: never): never {
  throw new TypeError(`unsupported generation source: ${String(value)}`);
}
