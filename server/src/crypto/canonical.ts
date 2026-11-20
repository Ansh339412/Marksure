/**
 * Deterministic Canonical JSON Serialization
 *
 * Ensures that any two JSON objects with identical values always serialize
 * to the exact same UTF-8 string regardless of property insertion order.
 */

export interface SubjectMark {
  code: string;
  name: string;
  marks: number;
  max_marks: number;
}

export interface ResultSnapshotPayload {
  result_id: string;
  student_id: string;
  roll_number: string;
  academic_term: string;
  version: number;
  subjects: SubjectMark[];
}

export interface PublicationManifestPayload {
  batch_id: string;
  institution_id: string;
  academic_term: string;
  merkle_root: string;
  record_count: number;
  published_at: string;
}

export interface CorrectionApprovalPayload {
  correction_request_id: string;
  result_id: string;
  from_version: number;
  subject_code: string;
  old_marks: number;
  new_marks: number;
  reason: string;
}

/**
 * Recursively sorts object keys lexicographically so JSON.stringify is 100% deterministic.
 */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const sortedObj: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      if (record[key] !== undefined) {
        sortedObj[key] = sortKeysDeep(record[key]);
      }
    }
    return sortedObj;
  }
  return value;
}

/**
 * Returns deterministic canonical JSON string with no extra whitespace.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

/**
 * Normalizes a result snapshot (sorts subjects ascending by subject code, forces integers for marks).
 */
export function normalizeResultSnapshot(input: ResultSnapshotPayload): ResultSnapshotPayload {
  const normalizedSubjects: SubjectMark[] = [...input.subjects]
    .map((s) => ({
      code: String(s.code).trim().toUpperCase(),
      name: String(s.name).trim(),
      marks: Number(s.marks),
      max_marks: Number(s.max_marks),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    academic_term: String(input.academic_term).trim(),
    result_id: String(input.result_id).trim(),
    roll_number: String(input.roll_number).trim(),
    student_id: String(input.student_id).trim(),
    subjects: normalizedSubjects,
    version: Number(input.version),
  };
}
