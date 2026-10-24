import type { SummarizeGroupDiscussionItemData } from '../pte/taskData';
import { matchAuthoredKeyPoint, type KeyPointMatch } from './retell-lecture.ts';
import { lexicalTerms } from './shared/lexicalCoverage.ts';

export type SpeakerContributionCoverage = Readonly<{
  speakerId: string; label: string; represented: boolean; matchedPoints: number; totalPoints: number; matches: readonly KeyPointMatch[];
}>;
export type SummarizeGroupDiscussionCoverage = Readonly<{
  keyPointCoverage: number; keyPointCoveragePercent: number; matchedKeyPoints: number; totalKeyPoints: number; keyPointMatches: readonly KeyPointMatch[];
  speakerCoverage: number; speakerCoveragePercent: number; representedSpeakers: number; totalSpeakers: number; speakerDetails: readonly SpeakerContributionCoverage[];
  relationshipCoverage?: number; relationshipCoveragePercent?: number; matchedRelationships?: number; totalRelationships?: number; relationshipMatches?: readonly KeyPointMatch[];
  responseWordCount: number;
}>;

/** Deterministic lexical coverage only. It does not infer meaning or reproduce Pearson Content scoring. */
export function calculateSummarizeGroupDiscussionCoverage(response: string, data: SummarizeGroupDiscussionItemData): SummarizeGroupDiscussionCoverage {
  if (!data.speakerPoints || data.speakerPoints.length !== data.speakers.length) throw new Error('Published SGD content requires authored points for each speaker.');
  const responseTerms = new Set(lexicalTerms(response));
  const matchPoints = (points: readonly string[]) => points.map(point => matchAuthoredKeyPoint(responseTerms, point));
  const keyPointMatches = matchPoints(data.keyPoints), matchedKeyPoints = keyPointMatches.filter(match => match.matched).length;
  const speakerDetails = data.speakers.map(speaker => {
    const authored = data.speakerPoints!.find(entry => entry.speakerId === speaker.id);
    if (!authored) throw new Error('Published SGD content is missing speaker contribution points.');
    const matches = matchPoints(authored.points), matchedPoints = matches.filter(match => match.matched).length;
    return Object.freeze({ speakerId: speaker.id, label: speaker.label, represented: matchedPoints > 0, matchedPoints, totalPoints: matches.length, matches: Object.freeze(matches) });
  });
  const representedSpeakers = speakerDetails.filter(speaker => speaker.represented).length;
  const relationships = data.relationships?.length ? matchPoints(data.relationships) : undefined;
  const matchedRelationships = relationships?.filter(match => match.matched).length;
  return Object.freeze({
    keyPointCoverage: data.keyPoints.length ? matchedKeyPoints / data.keyPoints.length : 0,
    keyPointCoveragePercent: data.keyPoints.length ? 100 * matchedKeyPoints / data.keyPoints.length : 0,
    matchedKeyPoints, totalKeyPoints: data.keyPoints.length, keyPointMatches: Object.freeze(keyPointMatches),
    speakerCoverage: data.speakers.length ? representedSpeakers / data.speakers.length : 0,
    speakerCoveragePercent: data.speakers.length ? 100 * representedSpeakers / data.speakers.length : 0,
    representedSpeakers, totalSpeakers: data.speakers.length, speakerDetails: Object.freeze(speakerDetails),
    ...(relationships ? { relationshipCoverage: relationships.length ? (matchedRelationships ?? 0) / relationships.length : 0,
      relationshipCoveragePercent: relationships.length ? 100 * (matchedRelationships ?? 0) / relationships.length : 0,
      matchedRelationships, totalRelationships: relationships.length, relationshipMatches: Object.freeze(relationships) } : {}),
    responseWordCount: responseTerms.size,
  });
}
