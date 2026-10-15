import { StrictMode } from 'react';
import type { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import './styles.css';
import './clinic.css';

const root = document.getElementById('root');
if (root === null) throw new Error('The desktop root element is missing.');

createRoot(root).render(
  <StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      theme="light"
      richColors
      closeButton
      style={
        {
          '--normal-bg': 'var(--card)',
          '--normal-text': 'var(--foreground)',
          '--normal-border': 'var(--border-strong)',
        } as CSSProperties
      }
    />
  </StrictMode>,
);
