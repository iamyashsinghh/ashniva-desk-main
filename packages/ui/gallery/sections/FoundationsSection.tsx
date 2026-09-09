import { Row, Section, Specimen } from '../Specimen';

const SURFACES = [
  { token: '--surface-page', label: 'page' },
  { token: '--surface-raised', label: 'raised' },
  { token: '--surface-sunken', label: 'sunken' },
  { token: '--surface-overlay', label: 'overlay' },
  { token: '--surface-inverse', label: 'inverse' },
];

const TEXT = [
  { token: '--color-text', label: 'text' },
  { token: '--color-text-muted', label: 'muted' },
  { token: '--color-text-faint', label: 'faint' },
  { token: '--brand-primary-text', label: 'brand (as text)' },
];

const TONES = ['neutral', 'info', 'progress', 'warning', 'success', 'review', 'danger'] as const;

const SPACING = ['1', '2', '3', '4', '5', '6', '7', '8', '10', '12', '16'];

const TYPE = [
  { token: '--font-size-3xl', label: '3xl · hero number' },
  { token: '--font-size-2xl', label: '2xl · KPI value' },
  { token: '--font-size-xl', label: 'xl · page title' },
  { token: '--font-size-lg', label: 'lg · dialog title' },
  { token: '--font-size-md', label: 'md · body' },
  { token: '--font-size-sm', label: 'sm · dense body' },
  { token: '--font-size-xs', label: 'xs · meta' },
];

const RADII = ['xs', 'sm', 'md', 'lg', 'xl'];
const SHADOWS = ['xs', 'sm', 'md', 'lg', 'xl'];

export function FoundationsSection() {
  return (
    <Section
      id="foundations"
      title="Foundations"
      summary="Every swatch below reads a CSS variable, so switching the scheme above repaints this page rather than re-rendering it."
    >
      <Specimen label="Surface levels">
        <Row>
          {SURFACES.map((surface) => (
            <div className="swatch" key={surface.token}>
              <span className="swatch__chip" style={{ background: `var(${surface.token})` }} />
              <span className="swatch__name">{surface.label}</span>
            </div>
          ))}
        </Row>
      </Specimen>

      <Specimen label="Text roles">
        <div className="stack">
          {TEXT.map((entry) => (
            <p key={entry.token} style={{ color: `var(${entry.token})` }}>
              The quick brown fox — {entry.label}
            </p>
          ))}
        </div>
      </Specimen>

      <Specimen label="Semantic tones (background · foreground · border)">
        <Row>
          {TONES.map((tone) => (
            <span
              key={tone}
              className="tone-chip"
              style={{
                background: `var(--tone-${tone}-bg)`,
                color: `var(--tone-${tone}-fg)`,
                borderColor: `var(--tone-${tone}-border)`,
              }}
            >
              {tone}
            </span>
          ))}
        </Row>
      </Specimen>

      <Specimen label="Interactive state washes (over the raised surface)">
        <Row>
          <span className="state-chip">rest</span>
          <span className="state-chip" style={{ background: 'var(--state-hover-bg)' }}>
            hover
          </span>
          <span className="state-chip" style={{ background: 'var(--state-active-bg)' }}>
            active
          </span>
          <span
            className="state-chip"
            style={{ background: 'var(--state-selected-bg)', color: 'var(--state-selected-fg)' }}
          >
            selected
          </span>
          <span className="state-chip" style={{ opacity: 'var(--state-disabled-opacity)' }}>
            disabled
          </span>
        </Row>
      </Specimen>

      <Specimen label="Spacing scale">
        <div className="stack">
          {SPACING.map((step) => (
            <div className="ruler" key={step}>
              <span className="ruler__label">space-{step}</span>
              <span className="ruler__bar" style={{ width: `var(--space-${step})` }} />
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen label="Type scale">
        <div className="stack">
          {TYPE.map((entry) => (
            <p key={entry.token} style={{ fontSize: `var(${entry.token})`, lineHeight: 1.2 }}>
              {entry.label}
            </p>
          ))}
        </div>
      </Specimen>

      <Specimen label="Radii">
        <Row>
          {RADII.map((radius) => (
            <div className="shape" key={radius} style={{ borderRadius: `var(--radius-${radius})` }}>
              {radius}
            </div>
          ))}
          <div className="shape" style={{ borderRadius: 'var(--radius-pill)' }}>
            pill
          </div>
        </Row>
      </Specimen>

      <Specimen label="Elevation">
        <Row>
          {SHADOWS.map((level) => (
            <div
              className="shape shape--raised"
              key={level}
              style={{ boxShadow: `var(--shadow-${level})` }}
            >
              {level}
            </div>
          ))}
        </Row>
      </Specimen>
    </Section>
  );
}
