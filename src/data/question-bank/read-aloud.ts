import type { StudyItem } from '../../domain/pte/types';

const passages: Pick<StudyItem, 'id' | 'difficulty' | 'transcript' | 'phraseGroups' | 'stressWords'>[] = [
  {
    id: 'ra-001',
    difficulty: 1,
    transcript: 'Many students use public transport to travel to university each day because it is convenient and affordable.',
    phraseGroups: [
      'Many students use public transport',
      'to travel to university each day',
      'because it is convenient and affordable',
    ],
    stressWords: ['students', 'public', 'transport', 'travel', 'university', 'convenient', 'affordable'],
  },
  {
    id: 'ra-002',
    difficulty: 1,
    transcript: 'Regular exercise can improve both physical health and mental wellbeing when it becomes part of a consistent routine.',
    phraseGroups: [
      'Regular exercise can improve',
      'both physical health and mental wellbeing',
      'when it becomes part of a consistent routine',
    ],
    stressWords: ['regular', 'exercise', 'improve', 'physical', 'health', 'mental', 'wellbeing', 'consistent', 'routine'],
  },
  {
    id: 'ra-003',
    difficulty: 2,
    transcript: 'Researchers often collect data from several sources so they can compare results and identify patterns more accurately.',
    phraseGroups: [
      'Researchers often collect data',
      'from several sources',
      'so they can compare results',
      'and identify patterns more accurately',
    ],
    stressWords: ['researchers', 'collect', 'data', 'sources', 'compare', 'results', 'identify', 'patterns', 'accurately'],
  },
  {
    id: 'ra-004',
    difficulty: 2,
    transcript: 'Urban planning plays an important role in determining how efficiently people can move through growing cities.',
    phraseGroups: [
      'Urban planning plays an important role',
      'in determining how efficiently',
      'people can move through growing cities',
    ],
    stressWords: ['urban', 'planning', 'important', 'role', 'determining', 'efficiently', 'people', 'move', 'growing', 'cities'],
  },
  {
    id: 'ra-005',
    difficulty: 3,
    transcript: 'Although digital technology has increased access to information, researchers continue to examine how constant connectivity affects concentration and long-term learning.',
    phraseGroups: [
      'Although digital technology has increased access to information',
      'researchers continue to examine',
      'how constant connectivity affects concentration',
      'and long-term learning',
    ],
    stressWords: [
      'digital', 'technology', 'increased', 'access', 'information', 'researchers',
      'examine', 'constant', 'connectivity', 'affects', 'concentration', 'learning',
    ],
  },
  {
    id: 'ra-006',
    difficulty: 3,
    transcript: 'Economic decisions are influenced by a combination of individual behaviour, government policy, market conditions, and expectations about future growth.',
    phraseGroups: [
      'Economic decisions are influenced',
      'by a combination of individual behaviour',
      'government policy',
      'market conditions',
      'and expectations about future growth',
    ],
    stressWords: [
      'economic', 'decisions', 'influenced', 'combination', 'individual', 'behaviour',
      'government', 'policy', 'market', 'conditions', 'expectations', 'future', 'growth',
    ],
  },
];

export const readAloudQuestions: StudyItem[] = passages.map((passage) => ({
  ...passage,
  taskType: 'read-aloud',
  prompt: 'Read the text aloud clearly and naturally.',
  answer: passage.transcript,
  createdAt: '2026-10-04T00:00:00.000Z',
}));
