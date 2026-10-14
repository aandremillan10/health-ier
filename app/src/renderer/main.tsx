import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './clinic.css';

const root = document.getElementById('root');
if (root === null) throw new Error('The desktop root element is missing.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
