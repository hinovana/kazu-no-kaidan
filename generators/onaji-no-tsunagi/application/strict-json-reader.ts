/**
 * 未知のJSON値を読みながら、型・範囲・必須keyのエラーをpath付きで蓄積する。
 *
 * decoder固有のschema判断は持たず、複数エラーを一度に報告するための
 * application境界の低水準readerだけを提供する。
 *
 * @packageDocumentation
 */

/**
 * 配列ではないobjectを返し、不正値ではエラーを追加して空objectを返す。
 *
 * @internal
 */
export function readRecord(
  source: unknown,
  path: string,
  errors: string[],
): Record<string, unknown> {
  if (
    typeof source !== "object"
    || source === null
    || Array.isArray(source)
  ) {
    errors.push(`${path}: オブジェクトでなければなりません。`);
    return {};
  }
  return source as Record<string, unknown>;
}

/**
 * 配列を返し、不正値ではエラーを追加して空配列を返す。
 *
 * @internal
 */
export function readArray(
  source: unknown,
  path: string,
  errors: string[],
): readonly unknown[] {
  if (!Array.isArray(source)) {
    errors.push(`${path}: 配列でなければなりません。`);
    return [];
  }
  return source;
}

/**
 * 空でない文字列を返し、不正値ではエラーを追加して空文字列を返す。
 *
 * @internal
 */
export function readNonEmptyString(
  source: unknown,
  path: string,
  errors: string[],
): string {
  if (typeof source !== "string" || source.trim().length === 0) {
    errors.push(`${path}: 空でない文字列でなければなりません。`);
    return "";
  }
  return source;
}

/**
 * 指定した閉区間内の整数を返し、不正値ではエラーを追加して下限値を返す。
 *
 * @internal
 */
export function readInteger(
  source: unknown,
  path: string,
  errors: string[],
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    !Number.isInteger(source)
    || typeof source !== "number"
    || source < minimum
    || source > maximum
  ) {
    const upperBound = maximum === Number.MAX_SAFE_INTEGER
      ? ""
      : `${maximum}以下`;
    errors.push(`${path}: ${minimum}以上${upperBound}の整数が必要です。`);
    return minimum;
  }
  return source;
}

/**
 * nullまたは指定範囲内の整数を返す。
 *
 * @internal
 */
export function readNullableInteger(
  source: unknown,
  path: string,
  errors: string[],
  minimum: number,
  maximum: number,
): number | null {
  if (source === null) {
    return null;
  }
  return readInteger(source, path, errors, minimum, maximum);
}

/**
 * 許可された文字列値を返し、不正値ではエラーを追加して先頭候補を返す。
 *
 * @internal
 */
export function readEnum<const Value extends string>(
  source: unknown,
  values: readonly Value[],
  path: string,
  errors: string[],
): Value {
  if (
    typeof source !== "string"
    || !values.includes(source as Value)
  ) {
    errors.push(`${path}: ${values.join(" / ")}のいずれかが必要です。`);
    return values[0] as Value;
  }
  return source as Value;
}

/**
 * 期待するliteralを返し、不一致ではエラーを追加する。
 *
 * @internal
 */
export function readLiteral<const Value extends string | number>(
  source: unknown,
  expected: Value,
  path: string,
  errors: string[],
): Value {
  if (source !== expected) {
    errors.push(`${path}: ${JSON.stringify(expected)}でなければなりません。`);
  }
  return expected;
}

/**
 * 必須keyの欠落と、schemaにない未知keyをエラーへ追加する。
 *
 * @internal
 */
export function checkKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  path: string,
  errors: string[],
): void {
  const expected = new Set(expectedKeys);
  for (const key of Object.keys(record)) {
    if (!expected.has(key)) {
      errors.push(`${path}.${key}: 未定義の項目です。入力ミスを確認してください。`);
    }
  }
  for (const key of expectedKeys) {
    if (!(key in record)) {
      errors.push(`${path}.${key}: 必須項目です。`);
    }
  }
}
