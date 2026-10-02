import { createBrowserRouter } from 'react-router-dom';

import App from './App';
import { HomePage, PlaceholderPage, StudyPage } from './layout/Pages';
import { WriteFromDictationPage } from '../features/write-from-dictation/WriteFromDictationPage';
import { RepeatSentencePage } from '../features/repeat-sentence/RepeatSentencePage';

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
        path: '/study/write-from-dictation',
        element: <WriteFromDictationPage />,
      },
      {
        path: '/study/repeat-sentence',
        element: <RepeatSentencePage />,
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
