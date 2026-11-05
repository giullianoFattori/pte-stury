import { countWords } from '../shared/writing/wordCount.ts';
import { endsWithTerminalPunctuation, hasDuplicatePunctuation, startsWithCapital } from '../shared/writing/sentenceBoundaries.ts';
import type { EssayStructureDiagnostics, EssayWritingMechanics } from './types.ts';

const TRANSITIONS = ['however', 'therefore', 'moreover', 'in addition', 'on the other hand', 'consequently', 'for example', 'in conclusion'] as const;
const INTRODUCTION_SIGNALS = /^(?:in this essay|this essay|this paper|i believe|i agree|i disagree|in my view|the question of|there is a debate)/iu;
const CONCLUSION_SIGNALS = /\b(?:in conclusion|to conclude|overall|ultimately|for these reasons|therefore)\b/iu;

export function analyseEssayStructure(response: string): EssayStructureDiagnostics {
  const paragraphs = response.replace(/\r\n?/gu, '\n').split(/\n\s*\n/u).map(value => value.trim()).filter(Boolean);
  const firstParagraph = paragraphs[0] ?? '', lastParagraph = paragraphs.at(-1) ?? '';
  const text = response.toLocaleLowerCase('en');
  const transitionSignals = TRANSITIONS.filter(signal => new RegExp(`\\b${signal.replaceAll(' ', '\\s+')}\\b`, 'iu').test(text));
  return Object.freeze({ paragraphCount: paragraphs.length, hasIntroductionLikeOpening: INTRODUCTION_SIGNALS.test(firstParagraph), hasConclusionSignal: CONCLUSION_SIGNALS.test(lastParagraph), averageParagraphWords: paragraphs.length ? paragraphs.reduce((sum, value) => sum + countWords(value), 0) / paragraphs.length : 0, transitionSignals: Object.freeze([...transitionSignals]) });
}

export function analyseEssayMechanics(response: string, sentenceCount: number): EssayWritingMechanics {
  return Object.freeze({ sentenceCount, startsWithCapital: startsWithCapital(response), endsWithTerminalPunctuation: endsWithTerminalPunctuation(response), duplicatePunctuation: hasDuplicatePunctuation(response) });
}
