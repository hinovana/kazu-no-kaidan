import assert from "node:assert/strict";
import {
  readdir,
  readFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const generatorDirectory = resolve(fileURLToPath(
  new URL("../", import.meta.url),
));
const domainDirectory = join(generatorDirectory, "domain");
const domainFiles = await findTypeScriptFiles(domainDirectory);
const dependencyViolations = [];

for (const file of domainFiles) {
  const sourceText = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith(".")) {
      dependencyViolations.push(
        `${relative(generatorDirectory, file)} imports package "${specifier}"`,
      );
      continue;
    }
    const importedPath = normalize(resolve(dirname(file), specifier));
    if (!isWithinDirectory(importedPath, domainDirectory)) {
      dependencyViolations.push(
        `${relative(generatorDirectory, file)} imports outside domain: ${specifier}`,
      );
    }
  }
}

assert.deepEqual(
  dependencyViolations,
  [],
  "domain must remain pure TypeScript that can be extracted without UI or runtime adapters",
);

console.log("onaji-no-tsunagi architecture boundary tests passed");

async function findTypeScriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findTypeScriptFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

function isWithinDirectory(path, directory) {
  const relativePath = relative(directory, path);
  return relativePath !== ".."
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath);
}
