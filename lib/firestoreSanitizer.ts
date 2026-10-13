/**
 * Universal Firestore Mutation Payload Sanitizer
 * DATA-02: Recursively strips keys whose value is strictly undefined,
 * while strictly preserving numeric 0, boolean false, empty strings, native Dates,
 * Firestore Timestamps, FieldValues, and arrays.
 */
export function sanitizeFirestorePayload<T>(input: T): T {
  if (input === undefined) {
    return undefined as any;
  }
  if (input === null || typeof input !== "object") {
    return input;
  }
  // Retain native Date instances
  if (input instanceof Date) {
    return input;
  }
  // Retain Firestore Timestamp and FieldValue instances
  if (
    typeof (input as any).toDate === "function" ||
    typeof (input as any).toMillis === "function" ||
    (input as any)._methodName ||
    (input as any).constructor?.name === "Timestamp" ||
    (input as any).constructor?.name === "FieldValue"
  ) {
    return input;
  }
  // Process Arrays: filter out undefined items, recursively sanitize remaining elements
  if (Array.isArray(input)) {
    return input
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestorePayload(item)) as any;
  }
  // Process Plain Objects: strip keys that are strictly undefined
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }
    cleaned[key] = sanitizeFirestorePayload(value);
  }
  return cleaned as T;
}
