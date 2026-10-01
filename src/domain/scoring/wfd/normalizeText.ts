export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[.,!?;:"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
