const ABBREVIATIONS = /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|u\.s|u\.k)\./giu;

/** Conservative terminal-mark count, excluding common abbreviations and decimal points. */
export function countDetectedSentences(value: string): number {
  const protectedText = value.replace(ABBREVIATIONS, match => match.replaceAll('.', '\uE000'))
    .replace(/(?<=\p{N})\.(?=\p{N})/gu, '\uE000');
  return [...protectedText.matchAll(/[.!?]+["'”’)}\]]*(?=\s|$)/gu)].length;
}

export function endsWithTerminalPunctuation(value: string): boolean {
  return /[.!?]["'”’)}\]]*\s*$/u.test(value.trim());
}

export function startsWithCapital(value: string): boolean {
  const first = value.trim().match(/[\p{L}]/u)?.[0];
  return !!first && first === first.toLocaleUpperCase('en') && first !== first.toLocaleLowerCase('en');
}

export function isAllCaps(value: string): boolean {
  const letters = value.match(/\p{L}/gu) ?? [];
  return letters.length > 0 && letters.every(letter => letter === letter.toLocaleUpperCase('en'));
}

export function hasDuplicatePunctuation(value: string): boolean {
  return /[!?]{2,}|\.{2,}(?!\.)|[,;:][,;:]/u.test(value);
}
