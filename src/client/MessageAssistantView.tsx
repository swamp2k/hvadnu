import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { MessageTone } from '../domain/message-tone';
import type { MessageAnalysisResult, MessageHistoryEntry } from '../domain/message-result';
import { analyzeMessage, getMessageHistory, MessageApiError } from './message-api';

const tones: Array<{ value: MessageTone; label: string }> = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'firm', label: 'Bestemt' },
  { value: 'hesitant', label: 'Tøvende' },
  { value: 'optimistic', label: 'Optimistisk' },
  { value: 'legal', label: 'Juridisk' },
  { value: 'sad', label: 'Ked' },
  { value: 'confused', label: 'Forvirret' },
  { value: 'tired', label: 'Træt' },
];

function ResultView({ result, message }: { result: MessageAnalysisResult; message: string }) {
  const [copied, setCopied] = useState(false);

  async function copyReply() {
    try {
      await navigator.clipboard.writeText(result.suggestedReply);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="result-stack" aria-live="polite">
      <article className="card message-result-card message-result-received">
        <h3>Modtaget besked</h3>
        <p>{message}</p>
      </article>

      <article className="card message-result-card message-result-reply">
        <div className="section-title-row">
          <h3>Forslag til svar</h3>
          <button className="text-button" type="button" onClick={copyReply}>{copied ? 'Kopieret' : 'Kopiér'}</button>
        </div>
        <blockquote>{result.suggestedReply}</blockquote>
      </article>

      <article className="card message-result-card message-result-analysis">
        <h3>AI fortolkning og analyse</h3>
        <p className="analysis-lead">{result.summary}</p>

        <div className="analysis-detail">
          <strong>{result.communicationAssessment.title}</strong>
          <p>{result.communicationAssessment.explanation}</p>
        </div>

        {result.legalAssessment.explanation && (
          <div className="analysis-detail">
            <strong>{result.legalAssessment.title}</strong>
            <p>{result.legalAssessment.explanation}</p>
          </div>
        )}

        {(result.replyNeeded.length > 0 || result.canIgnore.length > 0) && (
          <div className="analysis-points">
            {result.replyNeeded.length > 0 && <div><strong>Det er værd at svare på</strong><ul>{result.replyNeeded.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            {result.canIgnore.length > 0 && <div><strong>Det kan du godt lade ligge</strong><ul>{result.canIgnore.map((item) => <li key={item}>{item}</li>)}</ul></div>}
          </div>
        )}

        {result.uncertainty.missing.length > 0 && (
          <details className="analysis-uncertainty">
            <summary>Det er ikke helt klart</summary>
            <ul>{result.uncertainty.missing.map((item) => <li key={item}>{item}</li>)}</ul>
          </details>
        )}

        {result.citations.length > 0 && (
          <details className="analysis-sources">
            <summary>Kilder ({result.citations.length})</summary>
            <div className="source-detail-list">
              {result.citations.map((citation) => {
                const url = citation.locator?.startsWith('https://') || citation.locator?.startsWith('http://') ? citation.locator : null;
                return (
                  <div key={`${citation.sourceId}-${citation.locator ?? ''}`}>
                    <strong>{citation.label}</strong>
                    {url ? <p><a href={url} target="_blank" rel="noreferrer">Åbn kilde</a></p> : citation.locator ? <p className="muted">{citation.locator}</p> : null}
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </article>
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
  const [tone, setTone] = useState<MessageTone>('neutral');
  const [result, setResult] = useState<MessageAnalysisResult | null>(null);
  const [analyzedMessage, setAnalyzedMessage] = useState('');
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
      const response = await analyzeMessage(trimmed, { tone });
      setResult(response.analysis);
      setAnalyzedMessage(trimmed);
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
      <section className="intro"><h2>Hvad har du fået?</h2><p>Indsæt beskeden, vælg tonen du gerne vil svare i, og få et forslag med en kort forklaring.</p></section>
      <form className="message-form" onSubmit={(event) => { void submit(event); }}>
        <div className="tone-row">
          <span className="tone-label">Svar som</span>
          <div className="tone-toolbar" role="group" aria-label="Tone for svar">
            {tones.map((item) => (
              <button
                className={`tone-chip ${tone === item.value ? 'tone-chip-active' : ''}`}
                type="button"
                key={item.value}
                aria-pressed={tone === item.value}
                disabled={working}
                onClick={() => setTone(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <label htmlFor="message">Modtaget besked</label>
        <textarea id="message" value={message} onChange={(event) => { setMessage(event.target.value); setResult(null); }} placeholder="Indsæt beskeden her …" rows={7} autoComplete="off" spellCheck />
        <button className="primary-button" type="submit" disabled={!trimmed || working}>{working ? 'Tænker …' : 'Lav svar'}</button>
      </form>
      {error && <section className="card error-card" role="alert"><strong>Det lykkedes ikke</strong><p>{error}</p></section>}
      {historyWarning && <section className="card uncertainty-card" role="status"><strong>Historik ikke gemt</strong><p>{historyWarning}</p></section>}
      {result && <ResultView result={result} message={analyzedMessage} />}
      <History entries={history} />
    </>
  );
}
