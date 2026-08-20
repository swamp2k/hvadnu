import { useMemo, useState } from 'react';
import { SYNTHETIC_CASE_SNAPSHOT } from '../demo/synthetic-case-state';
import type { CurrentStateEntry } from '../domain/current-state';
import './current-case.css';

const stateLabel: Record<CurrentStateEntry['status'], string> = {
  confirmed: 'Bekræftet',
  candidate: 'Kandidat',
  superseded: 'Erstattet',
  rejected: 'Afvist',
};

const authorityLabel: Record<CurrentStateEntry['authority'], string> = {
  court_or_authority_decision: 'Myndighed/ret',
  signed_party_agreement: 'Underskrevet aftale',
  confirmed_party_agreement: 'Bekræftet aftale',
  lawyer_position: 'Advokatposition',
  party_claim: 'Partsudsagn',
  unknown: 'Ukendt',
};

export function CurrentCaseView() {
  const [showSuperseded, setShowSuperseded] = useState(false);
  const visibleState = useMemo(
    () => SYNTHETIC_CASE_SNAPSHOT.currentState.filter((entry) => showSuperseded || entry.status !== 'superseded'),
    [showSuperseded],
  );

  return (
    <>
      <section className="intro">
        <h2>Hvad gælder lige nu?</h2>
        <p>Et kildebaseret overblik over det, der er bekræftet, det der kun er foreslået, og hvad der er blevet erstattet.</p>
      </section>

      <section className="case-warning" role="note">
        <strong>M3a · syntetisk sagsmodel</strong>
        <span>Intet her er gemt i D1 endnu. Kandidater kan foreslås af AI, men kun bruger eller deterministiske regler må bekræfte gældende state.</span>
      </section>

      <section className="case-section">
        <div className="section-title-row">
          <div><p className="eyebrow">Current state</p><h2>Sagen lige nu</h2></div>
          <button className="text-button" type="button" onClick={() => setShowSuperseded((value) => !value)}>
            {showSuperseded ? 'Skjul erstattede' : 'Vis erstattede'}
          </button>
        </div>

        <div className="state-list">
          {visibleState.map((entry) => (
            <article className={`card state-card state-${entry.status}`} key={entry.id}>
              <div className="section-title-row">
                <strong>{entry.summary}</strong>
                <span className="status-pill">{stateLabel[entry.status]}</span>
              </div>
              <p className="muted">{authorityLabel[entry.authority]} · emne: {entry.topic}</p>
              <div className="source-links">
                {entry.sourceRefs.map((ref) => <span className="source-chip" key={`${entry.id}-${ref.sourceId}`}>{ref.sourceId}</span>)}
              </div>
              {entry.status === 'candidate' && (
                <p className="candidate-note">Dette er kun en kandidat. Den må ikke bruges som gældende state uden eksplicit bekræftelse.</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="case-section">
        <div><p className="eyebrow">Timeline</p><h2>Sagens tidslinje</h2></div>
        <div className="timeline">
          {[...SYNTHETIC_CASE_SNAPSHOT.timeline].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((event) => (
            <article className="timeline-item" key={event.id}>
              <div className="timeline-dot" aria-hidden="true" />
              <div className="timeline-content">
                <div className="section-title-row">
                  <strong>{event.title}</strong>
                  <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleDateString('da-DK')}</time>
                </div>
                <p>{event.summary}</p>
                <div className="source-links">
                  {event.sourceIds.map((sourceId) => <span className="source-chip" key={`${event.id}-${sourceId}`}>{sourceId}</span>)}
                  {event.disputed && <span className="source-chip disputed-chip">Bestridt</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
