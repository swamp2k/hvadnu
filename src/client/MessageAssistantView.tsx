import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { MessageAnalysisResult, MessageHistoryEntry } from '../domain/message-result';
import { analyzeMessage, getMessageHistory, MessageApiError } from './message-api';

const levelMeta = {
  supported: { label: 'Understøttet', className: 'status-supported' },
  uncertain: { label: 'Uklar', className: 'status-uncertain' },
  not_supported: { label: 'Ikke dokumenteret', className: 'status-not-supported' },
  attention: { label: 'Kræver opmærksomhed', className: 'status-attention' },
} as const;

function BulletList({ items, emptyText }: { items: string[]; emptyText: string }) {
  if (items.length === 0) return <p className="muted compact">{emptyText}</p>;
  return <ul className="bullet-list">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function ResultView({ result }: { result: MessageAnalysisResult }) {
  const [copied, setCopied] = useState(false);
  const meta = levelMeta[result.legalAssessment.level];
  const labels = useMemo(() => new Map(result.citations.map((citation) => [citation.sourceId, citation.label])), [result.citations]);

  async function copyReply() {
    try {
      await navigator.clipboard.writeText(result.suggestedReply);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const sourceChips = (sourceIds: string[]) => sourceIds.length === 0 ? null : (
    <div className="source-links" aria-label="Kilder">
      {sourceIds.map((sourceId) => <span className="source-chip" key={sourceId}>{labels.get(sourceId) ?? sourceId}</span>)}
    </div>
  );

  return (
    <section className="result-stack" aria-live="polite">
      <div className="result-heading"><div><p className="eyebrow">Analyse</p><h2>Det vigtigste først</h2></div><span className={`status-pill ${meta.className}`}>{meta.label}</span></div>
      <article className="card summary-card"><p>{result.summary}</p></article>
      <div className="two-up">
        <article className="card"><h3>Det bør du svare på</h3><BulletList items={result.replyNeeded} emptyText="Der er ikke noget bestemt, du behøver at svare på." /></article>
        <article className="card quiet-card"><h3>Det kan du lade ligge</h3><BulletList items={result.canIgnore} emptyText="Der er ikke noget oplagt, du kan ignorere." /></article>
      </div>
      {result.caseContext.length > 0 && <article className="card"><div className="section-title-row"><h3>Det ved vi fra sagen</h3><span className="source-count">{result.caseContext.length} fund</span></div><div className="context-list">{result.caseContext.map((item) => <div className="context-item" key={`${item.text}-${item.sourceIds.join('-')}`}><p>{item.text}</p>{sourceChips(item.sourceIds)}</div>)}</div></article>}
      <article className="card assessment-card"><div className="section-title-row"><h3>Juridisk vurdering</h3><span className={`status-dot ${meta.className}`} aria-hidden="true" /></div><strong>{result.legalAssessment.title}</strong><p>{result.legalAssessment.explanation}</p>{sourceChips(result.legalAssessment.sourceIds)}</article>
      <article className="card"><h3>Sådan kan beskeden læses</h3><strong>{result.communicationAssessment.title}</strong><p>{result.communicationAssessment.explanation}</p></article>
      <article className="card reply-card"><div className="section-title-row"><h3>Forslag til svar</h3><button className="text-button" type="button" onClick={copyReply}>{copied ? 'Kopieret' : 'Kopiér'}</button></div><blockquote>{result.suggestedReply}</blockquote></article>
      <article className="card uncertainty-card"><div className="section-title-row"><h3>Det er vi ikke sikre på</h3><span className="uncertainty-label">{result.uncertainty.level === 'high' ? 'Meget' : result.uncertainty.level === 'medium' ? 'Noget' : 'Lidt'}</span></div><BulletList items={result.uncertainty.missing} emptyText="Der mangler ikke noget vigtigt for denne vurdering." />{result.reviewPlan.humanReviewRecommended && <div className="review-strip"><strong>Det kan være en god idé at få en jurist til at se på dette</strong></div>}</article>
      {result.citations.length > 0 && <details className="card source-details"><summary>Kilder ({result.citations.length})</summary><div className="source-detail-list">{result.citations.map((citation) => <div key={`${citation.sourceId}-${citation.locator ?? ''}`}><strong>{citation.label}</strong><p className="muted">{citation.locator ?? ''}</p></div>)}</div></details>}
    </section>
  );
}

function History({ entries }: { entries: MessageHistoryEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="case-section message-history">
      <div><p className="eyebrow">Historik</p><h2>Tidligere beskeder</h2></div>
      <div className="state-list">
        {entries.map((entry) => <details className="card history-item" key={entry.id}>
          <summary>
            <span className="history-date">{new Date(entry.createdAt).toLocaleString('da-DK')}</span>
            <span className="history-preview history-message-preview">{entry.message}</span>
          </summary>
          <div className="history-detail-list">
            <div className="history-block history-message"><strong>Modtaget besked</strong><p>{entry.message}</p></div>
            <div className="history-block history-reply"><strong>Forslag til svar</strong><p>{entry.analysis.suggestedReply}</p></div>
            <div className="history-block history-analysis"><strong>Analyse</strong><p>{entry.analysis.summary}</p></div>
          </div>
        </details>)}
      </div>
    </section>
  );
}

export function MessageAssistantView() {
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<MessageAnalysisResult | null>(null);
  const [history, setHistory] = useState<MessageHistoryEntry[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyWarning, setHistoryWarning] = useState<string | null>(null);
  const trimmed = useMemo(() => message.trim(), [message]);

  async function refreshHistory() {
    try { setHistory(await getMessageHistory()); } catch { /* History failure must not block message analysis. */ }
  }

  useEffect(() => { void refreshHistory(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || working) return;
    setWorking(true);
    setError(null);
    setHistoryWarning(null);
    try {
      const response = await analyzeMessage(trimmed);
      setResult(response.analysis);
      if (!response.historySaved) setHistoryWarning('Analysen lykkedes, men historikken kunne ikke gemmes.');
      await refreshHistory();
    } catch (cause) {
      setResult(null);
      setError(cause instanceof MessageApiError && cause.status === 401 ? 'Din session er udløbet. Prøv at genindlæse siden.' : 'Beskeden kunne ikke analyseres lige nu.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <section className="intro"><h2>Hvad har du fået?</h2><p>Indsæt beskeden, så får du en kort vurdering og et forslag til svar. Beskeden og svaret gemmes automatisk i historikken.</p></section>
      <form className="message-form" onSubmit={(event) => { void submit(event); }}>
        <label htmlFor="message">Modtaget besked</label>
        <textarea id="message" value={message} onChange={(event) => { setMessage(event.target.value); setResult(null); }} placeholder="Indsæt beskeden her …" rows={7} autoComplete="off" spellCheck />
        <button className="primary-button" type="submit" disabled={!trimmed || working}>{working ? 'Analyserer …' : 'Analysér besked'}</button>
      </form>
      {error && <section className="card error-card" role="alert"><strong>Analyse mislykkedes</strong><p>{error}</p></section>}
      {historyWarning && <section className="card uncertainty-card" role="status"><strong>Historik ikke gemt</strong><p>{historyWarning}</p></section>}
      {result && <ResultView result={result} />}
      <History entries={history} />
    </>
  );
}
