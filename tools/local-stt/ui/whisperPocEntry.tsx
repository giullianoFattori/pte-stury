import { createRoot } from 'react-dom/client';
import { PocPage } from './whisperPocPage.tsx';

if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<PocPage />);
