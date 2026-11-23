import { DESCRIPTION_MAX_CODE_POINTS, OPT_IN_RECORD_VERSION } from './constants'
import type { ContractResult } from './url'

export interface OptInRecordV1 {
  v: typeof OPT_IN_RECORD_VERSION
  repoId: number
  path: string
  description: string
}

export type OptInValidationErrorCode =
  | 'INVALID_JSON_SHAPE'
  | 'UNSUPPORTED_VERSION'
  | 'REPO_ID_MISMATCH'
  | 'PATH_MISMATCH'
  | 'INVALID_DESCRIPTION'

export interface OptInValidationError {
  code: OptInValidationErrorCode
  message: string
}

export function countCodePoints(text: string): number {
  let count = 0
  for (const _cp of text) {
    void _cp
    count += 1
  }
  return count
}

export function validateOptInRecord(
  input: unknown,
  expected: { repoId: number; decodedPath: string },
): ContractResult<OptInRecordV1, OptInValidationError> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: { code: 'INVALID_JSON_SHAPE', message: 'Opt-in record must be a JSON object' } }
  }

  const record = input as Record<string, unknown>

  if (record.v !== OPT_IN_RECORD_VERSION) {
    return { ok: false, error: { code: 'UNSUPPORTED_VERSION', message: 'Opt-in record version must be 1' } }
  }

  if (typeof record.repoId !== 'number' || !Number.isSafeInteger(record.repoId) || record.repoId <= 0 || record.repoId !== expected.repoId) {
    return { ok: false, error: { code: 'REPO_ID_MISMATCH', message: 'Opt-in record repoId does not match repository' } }
  }

  if (typeof record.path !== 'string' || record.path.normalize('NFC') !== expected.decodedPath.normalize('NFC')) {
    return { ok: false, error: { code: 'PATH_MISMATCH', message: 'Opt-in record path does not match canonical decoded path' } }
  }

  if (typeof record.description !== 'string') {
    return { ok: false, error: { code: 'INVALID_DESCRIPTION', message: 'Opt-in record description must be a string' } }
  }

  const trimmed = record.description.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: { code: 'INVALID_DESCRIPTION', message: 'Opt-in record description must not be blank' } }
  }

  if (countCodePoints(record.description) > DESCRIPTION_MAX_CODE_POINTS) {
    return {
      ok: false,
      error: {
        code: 'INVALID_DESCRIPTION',
        message: `Opt-in record description exceeds ${DESCRIPTION_MAX_CODE_POINTS} Unicode code points`,
      },
    }
  }

  return {
    ok: true,
    value: {
      v: OPT_IN_RECORD_VERSION,
      repoId: record.repoId,
      path: expected.decodedPath.normalize('NFC'),
      description: record.description,
    },
  }
}
