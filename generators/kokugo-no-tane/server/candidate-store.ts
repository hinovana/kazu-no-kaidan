import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface CandidateRecord {
  readonly candidateId: string;
  readonly rawRecord: unknown;
  readonly validatedRecord: unknown;
}

export interface CandidateStore {
  save(record: CandidateRecord): Promise<void>;
}

export function createCandidateStore(localDir: string): CandidateStore {
  const root = path.resolve(localDir, "model-candidates");
  return {
    async save({ candidateId, rawRecord, validatedRecord }) {
      await Promise.all([
        writeJsonAtomic(path.join(root, "raw", `${candidateId}.json`), rawRecord),
        writeJsonAtomic(path.join(root, "validated", `${candidateId}.json`), validatedRecord),
      ]);
    },
  };
}

export function createMemoryCandidateStore(): CandidateStore & {
  readonly records: CandidateRecord[];
} {
  const records: CandidateRecord[] = [];
  return {
    records,
    async save(record) {
      records.push(structuredCloneSafe(record));
    },
  };
}

async function writeJsonAtomic(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, filename);
}

function structuredCloneSafe<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
