import { isValidDate, isValidTime } from './date';

export class ValidationError extends Error {
  constructor(public message: string) {
    super(message);
  }
}

const DEFAULT_MAX_LEN = 255;

export async function parseBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new ValidationError('Invalid JSON body');
  }
}

export function requireString(value: unknown, field: string, maxLen = DEFAULT_MAX_LEN): string {
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  const s = value.trim();
  if (!s) throw new ValidationError(`${field} must not be empty`);
  if (s.length > maxLen) throw new ValidationError(`${field} must be ${maxLen} characters or fewer`);
  return s;
}

export function optionalString(value: unknown, field: string, maxLen = DEFAULT_MAX_LEN): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  if (value.length > maxLen) throw new ValidationError(`${field} must be ${maxLen} characters or fewer`);
  return value.trim();
}

export function requireEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) {
    throw new ValidationError(`Invalid ${field}: ${value}. Must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

export function requireInt(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new ValidationError(`${field} must be an integer`);
  return n;
}

// Finite number allowing decimals (e.g. handicap, stakes). Rejects Infinity/NaN.
export function optionalNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a finite number`);
  return n;
}

export function requireDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !isValidDate(value)) {
    throw new ValidationError(`${field} must be a valid YYYY-MM-DD date`);
  }
  return value;
}

export function optionalTime(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !isValidTime(value)) {
    throw new ValidationError(`${field} must be a valid HH:MM time`);
  }
  return value;
}
