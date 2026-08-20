import { useEffect, useMemo, useState } from 'react';
import type { CaseSnapshot } from '../domain/case-state';
import type { CurrentStateEntry } from '../domain/current-state';
import { CaseApiError, deleteCase, exportCase, getCaseSnapshot } from './case-api';
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

function caseErrorMessage(error: unknown): string {
  if (error instanceof CaseApiError) {
    if (error.status === 401) return 'Cloudflare Access-sessionen kunne ikke godkendes.';
    if (error.status === 503) return 'Sagsdatabasen er ikke klar endnu.';
  }
  return 'Sagen kunne ikke hentes lige nu.';
}

function downloadJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `hvadnu-case-export-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CurrentCaseView() {
  const [snapshot, setSnapshot] = useState<CaseSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [maintenanceWorking, setMaintenanceWorking] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await getCaseSnapshot());
    } catch (cause) {
      setSnapshot(null);
      setError(caseErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const visibleState = useMemo(
    () => (snapshot?.currentState ?? []).filter((entry) => showSuperseded || entry.status !== 'superseded'),
    [showSuperseded, snapshot],
  );

  const timeline = useMemo(() => [...(snapshot?.timeline ?? [])].sort((a, b) => {
    if (a.occurredAt === null && b.occurredAt === null) return 0;
    if (a.occurredAt === null) return 1;
    if (b.occurredAt === null) return -1;
    return b.occurredAt.localeCompare(a.occurredAt);
  }), [snapshot]);

  async function handleExport() {
    setMaintenanceWorking(true);
    setError(null);
    try {
      downloadJson(await exportCase());
    } catch (cause) {
      setError(caseErrorMessage(cause));
    } finally {
      setMaintenanceWorking(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Slet hele den gemte sag? Dette fjerner alle gemte kilder, analyser, timeline-poster og current-state data.')) return;
    setMaintenanceWorking(true);
    setError(null);
    try {
      await deleteCase();
      await refresh();
    } catch (cause) {
      setError(caseErrorMessage(cause));
    } finally {
      setMaintenanceWorking(false);
    }
  }

  return (
    <>
      <section className="intro">
        <h2>Hvad gælder lige nu?</h2>
        <p>Et kildebaseret overblik over det, der er gemt i sagen. Dokumentanalyse bliver ikke automatisk til gældende state.</p>
      </section>

      <section className="case-warning" role="note">
        <strong>M3b · live sag</strong>
        <span>Kilder gemmes kun efter et eksplicit “Gem i sagen”. AI kan foreslå kandidater senere, men kun bruger eller deterministiske regler må bekræfte gældende state.</span>
      </section>

      <section className="case-maintenance card">
        <div className="section-title-row">
          <div><strong>Datahåndtering</strong><p className="muted compact">Eksportér alt eller slet hele den gemte sag.</p></div>
          <div className="case-actions">
            <button className="text-button" type="button" disabled={maintenanceWorking} onClick={() => { void handleExport(); }}>Eksportér</button>
            <button className="text-button danger-text" type="button" disabled={maintenanceWorking} onClick={() => { void handleDelete(); }}>Slet sag</button>
          </div>
        </div>
      </section>

      {error && <section className="card error-card" role="alert"><strong>Sagen er ikke tilgængelig</strong><p>{error}</p></section>}
      {loading && <section className="empty-state"><div className="empty-icon">…</div><h3>Henter sagen</h3></section>}

      {!loading && snapshot && (
        <>
          <section className="case-section">
            <div className="section-title-row">
              <div><p className="eyebrow">Current state</p><h2>Sagen lige nu</h2></div>
              <button className="text-button" type="button" onClick={() => setShowSuperseded((value) => !value)}>
                {showSuperseded ? 'Skjul erstattede' : 'Vis erstattede'}
              </button>
            </div>

            <div className="state-list">
              {visibleState.length === 0 && (
                <article className="card quiet-card">
                  <strong>Ingen bekræftet current state endnu</strong>
                  <p>Gemte dokumenter kommer på tidslinjen, men bliver ikke automatisk gjort gældende.</p>
                </article>
              )}
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
              {timeline.length === 0 && (
                <article className="card quiet-card"><strong>Ingen gemte kilder endnu</strong><p>Analyser et dokument og vælg derefter “Gem i sagen”.</p></article>
              )}
              {timeline.map((event) => (
                <article className="timeline-item" key={event.id}>
                  <div className="timeline-dot" aria-hidden="true" />
                  <div className="timeline-content">
                    <div className="section-title-row">
                      <strong>{event.title}</strong>
                      {event.occurredAt ? <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleDateString('da-DK')}</time> : <span className="muted">Dato ukendt</span>}
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
      )}
    </>
  );
}
