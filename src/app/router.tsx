import { createBrowserRouter } from 'react-router-dom';

import App from './App';
import { StudySessionPage } from '../features/study-session/StudySessionPage';
import { HomePage, PlaceholderPage, StudyPage } from './layout/Pages';
import { WriteFromDictationPage } from '../features/write-from-dictation/WriteFromDictationPage';
import { RepeatSentencePage } from '../features/repeat-sentence/RepeatSentencePage';
import { ReadAloudPage } from '../features/read-aloud/ReadAloudPage';
import { RetellLecturePage } from '../features/retell-lecture/RetellLecturePage';
import { SummarizeGroupDiscussionPage } from '../features/summarize-group-discussion/SummarizeGroupDiscussionPage';
import { DescribeImagePage } from '../features/describe-image/DescribeImagePage';
import { SummarizeWrittenTextPage } from '../features/summarize-written-text/SummarizeWrittenTextPage';
import { SummarizeSpokenTextPage } from '../features/summarize-spoken-text/SummarizeSpokenTextPage';
import { HighlightIncorrectWordsPage } from '../features/highlight-incorrect-words/HighlightIncorrectWordsPage';
import { ListeningFillBlanksTypeInPage } from '../features/listening-fill-blanks/ListeningFillBlanksTypeInPage';
import { ReadingFillBlanksDropdownPage } from '../features/reading-fill-blanks-dropdown/ReadingFillBlanksDropdownPage';
import { ReadingFillBlanksDragDropPage } from '../features/reading-fill-blanks-drag-drop/ReadingFillBlanksDragDropPage';
import { ReorderParagraphPage } from '../features/reorder-paragraph/ReorderParagraphPage';

export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      {
        path: '/',
        element: <HomePage />,
      },
      {
        path: '/study',
        element: <StudyPage />,
      },
      {
        path: '/study/session/:sessionId',
        element: <StudySessionPage />,
      },
      {
        path: '/study/write-from-dictation',
        element: <WriteFromDictationPage />,
      },
      {
        path: '/study/repeat-sentence',
        element: <RepeatSentencePage />,
      },
      {
        path: '/study/read-aloud',
        element: <ReadAloudPage />,
      },
      {
        path: '/study/retell-lecture',
        element: <RetellLecturePage />,
      },
      {
        path: '/study/summarize-group-discussion',
        element: <SummarizeGroupDiscussionPage />,
      },
      {
        path: '/study/describe-image',
        element: <DescribeImagePage />,
      },
      {
        path: '/study/summarize-written-text',
        element: <SummarizeWrittenTextPage />,
      },
      {
        path: '/study/summarize-spoken-text',
        element: <SummarizeSpokenTextPage />,
      },
      {
        path: '/study/highlight-incorrect-words',
        element: <HighlightIncorrectWordsPage />,
      },
      {
        path: '/study/listening-fill-blanks-type-in',
        element: <ListeningFillBlanksTypeInPage />,
      },
      {
        path: '/study/reading-fill-blanks-dropdown',
        element: <ReadingFillBlanksDropdownPage />,
      },
      {
        path: '/study/reading-fill-blanks-drag-drop',
        element: <ReadingFillBlanksDragDropPage />,
      },
      {
        path: '/study/reorder-paragraph',
        element: <ReorderParagraphPage />,
      },
      {
        path: '/review',
        element: <PlaceholderPage title="Review" />,
      },
      {
        path: '/errors',
        element: <PlaceholderPage title="Errors" />,
      },
      {
        path: '/settings',
        element: <PlaceholderPage title="Settings" />,
      },
    ],
  },
]);
