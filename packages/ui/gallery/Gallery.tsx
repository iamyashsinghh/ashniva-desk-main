import { useEffect, useState } from 'react';

import { applyColorScheme, type ColorSchemePreference } from '../src/tokens/color-scheme';
import { SegmentedControl } from '../src/components/tabs/Tabs';

import { ControlsSection } from './sections/ControlsSection';
import { DataSection } from './sections/DataSection';
import { FeedbackSection } from './sections/FeedbackSection';
import { FormsSection } from './sections/FormsSection';
import { FoundationsSection } from './sections/FoundationsSection';
import { OverlaysSection } from './sections/OverlaysSection';

const SECTIONS = [
  { id: 'foundations', label: 'Foundations' },
  { id: 'controls', label: 'Controls' },
  { id: 'forms', label: 'Forms' },
  { id: 'data', label: 'Data' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'overlays', label: 'Overlays' },
];

/**
 * Every component, in every state, in both schemes.
 *
 * The scheme switch at the top is the reason this page exists in this form rather than as a set
 * of screenshots: dark is a redefinition of the same tokens, and the only honest way to review it
 * is to flip it while looking at the same markup.
 */
export function Gallery() {
  const [scheme, setScheme] = useState<ColorSchemePreference>('system');

  useEffect(() => {
    applyColorScheme(scheme);
  }, [scheme]);

  return (
    <div className="gallery">
      <header className="gallery__bar">
        <div>
          <p className="gallery__eyebrow">Ashniva Desk</p>
          <h1 className="gallery__title">Component gallery</h1>
        </div>
        <SegmentedControl
          aria-label="Colour scheme"
          size="sm"
          value={scheme}
          onChange={setScheme}
          options={[
            { key: 'light', label: 'Light' },
            { key: 'dark', label: 'Dark' },
            { key: 'system', label: 'System' },
          ]}
        />
      </header>
      <div className="gallery__layout">
        <nav className="gallery__nav" aria-label="Sections">
          <ul>
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="gallery__main">
          <FoundationsSection />
          <ControlsSection />
          <FormsSection />
          <DataSection />
          <FeedbackSection />
          <OverlaysSection />
        </main>
      </div>
    </div>
  );
}
