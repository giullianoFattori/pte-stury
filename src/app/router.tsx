import { createBrowserRouter } from 'react-router-dom';

import App from './App';
import { HomePage, PlaceholderPage } from './layout/Pages';

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
        element: <PlaceholderPage title="Study" />,
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
