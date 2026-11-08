export function normalizeShortAnswer(value: string): string {
  return value.normalize('NFKC').replace(/[’‘`]/gu, "'").trim().toLocaleLowerCase('en').replace(/\s+/gu, ' ').replace(/^[.!?,;:]+|[.!?,;:]+$/gu, '').replace(/^(?:a|an|the)\s+/u, '').trim();
}
export function shortAnswerWords(value: string): string[] {
  return normalizeShortAnswer(value).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
}
