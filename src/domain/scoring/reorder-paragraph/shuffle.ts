/** Stable seeded shuffle for an attempt identity; never uses render-time Math.random(). */
export function shuffleParagraphIds(blockIds: readonly string[], correctOrder: readonly string[], seedText: string): string[] {
  if (blockIds.length < 3 || blockIds.length !== correctOrder.length || new Set(blockIds).size !== blockIds.length
    || blockIds.some(id => !correctOrder.includes(id))) throw new Error('Shuffle requires one unique identity per authored block.');
  let seed = 2166136261;
  for (const char of seedText) { seed ^= char.codePointAt(0)!; seed = Math.imul(seed, 16777619); }
  const random = () => { seed += 0x6D2B79F5; let value = seed; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
  const shuffled = [...blockIds];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  if (shuffled.every((id, index) => id === correctOrder[index])) shuffled.push(shuffled.shift()!);
  return shuffled;
}
