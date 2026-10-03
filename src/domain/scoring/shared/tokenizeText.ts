import { normalizeText } from './normalizeText.ts';

export function tokenizeText(value: string): string[] {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(' ') : [];
}
