import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { CaseQueryResult } from '../domain/case-query';
import type { CaseSnapshot } from '../domain/case-state';
import type { CurrentStateEntry } from '../domain/current-state';
import { CaseApiError, deleteCase, exportCase, getCaseSnapshot, queryCase } from './case-api';
import './current-case.css';

const stateLabel: Record<CurrentStateEntry['status'], string> = {
  confirmed: 'Bekræftet',
  candidate: 'Forslag',
  superseded: 'Erstattet',
  rejected: 'Afvist',
};

const authorityLabel: Record<CurrentStateEntry['authority'], string> = {
  court_or_authority_decision: 'Afgørelse',
  signed_party_agreement: 'Underskrevet aftale',
  confirmed_party_agreement: 'Bekræftet aftale',
  lawyer_position: 'Advokatens vurdering',
  party_claim: 'Påstand fra en part',
  unknown: 'Ukendt',
};

function caseErrorMessage(error: unknown): string {
  if (error instanceof CaseApiError) {
    if (error.status === 401) return 'Din session er udløbet. Prøv at genindlæse siden.';
    if (error.status === 503) return 'Sagen kan ikke hentes lige nu.';
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
  const [question, setQuestion] = useState('');
  const [queryResult, setQueryResult] = useState<CaseQueryResult | null>(null);
  const [queryWorking, setQueryWorking] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

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

  useEffect(() => { void refresh(); }, []);

  const sourceLabels = useMemo(
    () => new Map((snapshot?.sources ?? []).map((source) => [source.id, source.label])),
    [snapshot],
  );

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
    try { downloadJson(await exportCase()); } catch (cause) { setError(caseErrorMessage(cause)); } finally { setMaintenanceWorking(false); }
  }

  async function handleDelete() {
    if (!window.confirm('Slet hele den gemte sag? Dette fjerner alle gemte dokumenter, beskeder og analyser.')) return;
    setMaintenanceWorking(true);
    setError(null);
    try { await deleteCase(); await refresh(); } catch (cause) { setError(caseErrorMessage(cause)); } finally { setMaintenanceWorking(false); }
  }

  async function handleQuery(event: FormEvent) {
    event.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion || queryWorking) return;
    setQueryWorking(true);
    setQueryError(null);
    try {
      setQueryResult(await queryCase(cleanQuestion));
    } catch (cause) {
      setQueryResult(null);
      setQueryError(caseErrorMessage(cause));
    } finally {
      setQueryWorking(false);
    }
  }

  return (
    <>
      <section className="intro">
        <h2>Hvad gælder lige nu?</h2>
        <p>Her samles de aftaler og afgørelser, som er bekræftet i sagen. Dokumenter og beskeder bliver ikke automatisk gjort gældende.</p>
      </section>

      <form className="case-query card" onSubmit={(event) => { void handleQuery(event); }}>
        <div>
          <strong>Spørg til sagen</strong>
          <p className="muted compact">AI søger i dine gemte beskeder og dokumenter. Hvis sagen ikke indeholder svaret, får du tydeligt besked og et generelt websvar i stedet.</p>
        </div>
        <textarea
          value={question}
          onChange={(event) => { setQuestion(event.target.value); setQueryResult(null); }}
          placeholder="Fx: Hvad står der om vurderingen af huset?"
          rows={2}
          disabled={queryWorking}
        />
        <button className="primary-button" type="submit" disabled={!question.trim() || queryWorking}>{queryWorking ? 'Søger …' : 'Spørg AI'}</button>
      </form>

      {queryError && <section className="card error-card" role="alert"><strong>Kunne ikke svare</strong><p>{queryError}</p></section>}
      {queryResult && (
        <section className="card case-query-result" aria-live="polite">
          <div className="section-title-row">
            <strong>Svar</strong>
            <span className={`case-query-badge ${queryResult.caseEvidenceFound ? 'case-query-badge-case' : 'case-query-badge-web'}`}>
              {queryResult.caseEvidenceFound ? 'Fra sagen' : 'Websvar'}
            </span>
          </div>
          <p className="case-query-answer">{queryResult.answer}</p>
          {queryResult.sources.length > 0 && (
            <details className="case-query-sources">
              <summary>Kilder ({queryResult.sources.length})</summary>
              <div className="source-detail-list">
                {queryResult.sources.map((source, index) => {
                  const url = source.locator?.startsWith('https://') || source.locator?.startsWith('http://') ? source.locator : null;
                  return (
                    <div key={`${source.kind}-${source.label}-${index}`}>
                      <strong>{source.label}</strong>
                      {url ? <p><a href={url} target="_blank" rel="noreferrer">Åbn kilde</a></p> : source.locator ? <p className="muted">{source.locator}</p> : null}
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </section>
      )}

      <section className="case-maintenance card">
        <div className="section-title-row">
          <div><strong>Din sag</strong><p className="muted compact">Hent en kopi eller slet alt, der er gemt.</p></div>
          <div className="case-actions">
            <button className="text-button" type="button" disabled={maintenanceWorking} onClick={() => { void handleExport(); }}>Hent kopi</button>
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
              <div><p className="eyebrow">Lige nu</p><h2>Sagen lige nu</h2></div>
              <button className="text-button" type="button" onClick={() => setShowSuperseded((value) => !value)}>{showSuperseded ? 'Skjul gamle' : 'Vis gamle'}</button>
            </div>

            <div className="state-list">
              {visibleState.length === 0 && (
                <article className="card quiet-card">
                  <strong>Der er endnu ikke noget bekræftet her</strong>
                  <p>Gemte dokumenter og beskeder vises på tidslinjen, men bliver først vist her, når det er bekræftet, hvad der faktisk gælder.</p>
                </article>
              )}
              {visibleState.map((entry) => (
                <article className={`card state-card state-${entry.status}`} key={entry.id}>
                  <div className="section-title-row"><strong>{entry.summary}</strong><span className="status-pill">{stateLabel[entry.status]}</span></div>
                  <p className="muted">{authorityLabel[entry.authority]} · {entry.topic}</p>
                  <div className="source-links">{entry.sourceRefs.map((ref) => <span className="source-chip" key={`${entry.id}-${ref.sourceId}`}>{sourceLabels.get(ref.sourceId) ?? ref.sourceId}</span>)}</div>
                  {entry.status === 'candidate' && <p className="candidate-note">Dette er et forslag og er ikke bekræftet som gældende endnu.</p>}
                </article>
              ))}
            </div>
          </section>

          <section className="case-section">
            <div><p className="eyebrow">Historik</p><h2>Sagens tidslinje</h2></div>
            <div className="timeline">
              {timeline.length === 0 && <article className="card quiet-card"><strong>Der er ikke gemt noget endnu</strong><p>Gem et dokument eller analysér en besked, så dukker det op her.</p></article>}
              {timeline.map((event) => (
                <article className="timeline-item" key={event.id}>
                  <div className="timeline-dot" aria-hidden="true" />
                  <div className="timeline-content">
                    <div className="section-title-row"><strong>{event.title}</strong>{event.occurredAt ? <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleDateString('da-DK')}</time> : <span className="muted">Dato ukendt</span>}</div>
                    <p>{event.summary}</p>
                    <div className="source-links">{event.sourceIds.map((sourceId) => <span className="source-chip" key={`${event.id}-${sourceId}`}>{sourceLabels.get(sourceId) ?? sourceId}</span>)}{event.disputed && <span className="source-chip disputed-chip">Uenighed om dette</span>}</div>
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
