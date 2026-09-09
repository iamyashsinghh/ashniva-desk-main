import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '../src/tokens/tokens.css';
import '../src/styles/global.css';
import './gallery.css';

import { Gallery } from './Gallery';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Gallery />
    </StrictMode>,
  );
}
