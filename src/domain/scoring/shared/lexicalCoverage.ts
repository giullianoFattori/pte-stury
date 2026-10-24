import { tokenizeText } from './tokenizeText.ts';

const STOP_WORDS = new Set('a an and are as at be been but by for from had has have he her his i in is it its of on or our she that the their them there these they this to was we were which who will with you your'.split(' '));
const WORD_NUMBERS = new Map<string,string>(['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'].map((word,index)=>[word,String(index)]));
const NUMBER_WORDS = new Map([...WORD_NUMBERS].map(([word,number])=>[number,word]));
export const AUTHORED_COVERAGE_CONFIG = Object.freeze({ minimumAnchors: 2, requiredFraction: 0.6 });
export function lexicalTerms(text: string): readonly string[] {
  const values = tokenizeText(text).flatMap(term => {
    const canonical = WORD_NUMBERS.get(term) ?? term;
    return canonical !== term ? [term, canonical] : NUMBER_WORDS.has(term) ? [term, NUMBER_WORDS.get(term)!] : [term];
  });
  return Object.freeze([...new Set(values)]);
}
export function meaningfulTerms(text: string): readonly string[] { return Object.freeze([...new Set(lexicalTerms(text).filter(term => !STOP_WORDS.has(term)))]); }
export type AuthoredTermMatch = Readonly<{ keyPoint: string; matched: boolean; matchedTerms: readonly string[]; requiredTerms: readonly string[] }>;
export function matchAuthoredTerms(responseTerms: ReadonlySet<string>, text: string): AuthoredTermMatch {
  const requiredTerms = meaningfulTerms(text), threshold = Math.min(requiredTerms.length, Math.max(1, AUTHORED_COVERAGE_CONFIG.minimumAnchors, Math.ceil(requiredTerms.length * AUTHORED_COVERAGE_CONFIG.requiredFraction)));
  const matchedTerms = requiredTerms.filter(term => responseTerms.has(term));
  return Object.freeze({ keyPoint: text, matched: requiredTerms.length > 0 && matchedTerms.length >= threshold, matchedTerms: Object.freeze(matchedTerms), requiredTerms });
}
export function calculateAuthoredCoverage(response: string, authored: readonly string[]) {
  const responseTerms = new Set(lexicalTerms(response)), matches = authored.map(text => matchAuthoredTerms(responseTerms,text)), matched = matches.filter(entry=>entry.matched).length;
  return Object.freeze({ coverage:matches.length?matched/matches.length:0, coveragePercent:matches.length?100*matched/matches.length:0, matched, total:matches.length, matches:Object.freeze(matches), responseTerms });
}
