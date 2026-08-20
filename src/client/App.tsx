import { useMemo, useState, type FormEvent } from 'react';
import { analyzeDemoMessage } from '../demo/analyze-demo-message';
import { DEMO_MESSAGES, DEMO_SOURCES } from '../demo/synthetic-case';
import type { MessageAnalysisResult } from '../domain/message-result';
import { DocumentsView } from './DocumentsView';

const levelMeta = {
  supported: { label: 'Understøttet', className: 'status-supported' },
  uncertain: { label: 'Uklar', className: 'status-uncertain' },
  not_supported: { label: 'Ikke dokumenteret', className: 'status-not-supported' },
  attention: { label: 'Kræver opmærksomhed', className: 'status-attention' },
} as const;

function BulletList({ items, emptyText }: { items: string[]; emptyText: string }) {
  if (items.length === 0) return <p className="muted compact">{emptyText}</p>;
  return (
    <ul className="bullet-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function SourceLinks({ sourceIds }: { sourceIds: string[] }) {
  if (sourceIds.length === 0) return null;
  return (
    <div className="source-links" aria-label="Kilder">
      {sourceIds.map((sourceId) => {
        const source = DEMO_SOURCES[sourceId];
        return <span className="source-chip" key={sourceId}>{source?.label ?? sourceId}</span>;
      })}
    </div>
  );
}

function ResultView({ result }: { result: MessageAnalysisResult }) {
  const [copied, setCopied] = useState(false);
  const meta = levelMeta[result.legalAssessment.level];

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
      <div className="result-heading">
        <div>
          <p className="eyebrow">Analyse</p>
          <h2>Det vigtigste først</h2>
        </div>
        <span className={`status-pill ${meta.className}`}>{meta.label}</span>
      </div>

      <article className="card summary-card"><p>{result.summary}</p></article>

      <div className="two-up">
        <article className="card">
          <h3>Det bør du svare på</h3>
          <BulletList items={result.replyNeeded} emptyText="Intet konkret svar er identificeret." />
        </article>
        <article className="card quiet-card">
          <h3>Det kan du lade ligge</h3>
          <BulletList items={result.canIgnore} emptyText="Ingen tydelig støj er identificeret." />
        </article>
      </div>

      {result.caseContext.length > 0 && (
        <article className="card">
          <div className="section-title-row"><h3>Hvad ved sagen?</h3><span className="source-count">{result.caseContext.length} fund</span></div>
          <div className="context-list">
            {result.caseContext.map((item) => (
              <div className="context-item" key={item.text}>
                <p>{item.text}</p>
                <SourceLinks sourceIds={item.sourceIds} />
              </div>
            ))}
          </div>
        </article>
      )}

      <article className="card assessment-card">
        <div className="section-title-row"><h3>Juridisk vurdering</h3><span className={`status-dot ${meta.className}`} aria-hidden="true" /></div>
        <strong>{result.legalAssessment.title}</strong>
        <p>{result.legalAssessment.explanation}</p>
        <SourceLinks sourceIds={result.legalAssessment.sourceIds} />
      </article>

      <article className="card">
        <h3>Kommunikationsmæssigt</h3>
        <strong>{result.communicationAssessment.title}</strong>
        <p>{result.communicationAssessment.explanation}</p>
      </article>

      <article className="card reply-card">
        <div className="section-title-row"><h3>Forslag til svar</h3><button className="text-button" type="button" onClick={copyReply}>{copied ? 'Kopieret' : 'Kopiér'}</button></div>
        <blockquote>{result.suggestedReply}</blockquote>
      </article>

      <article className="card uncertainty-card">
        <div className="section-title-row">
          <h3>Usikkerhed</h3>
          <span className="uncertainty-label">{result.uncertainty.level === 'high' ? 'Høj' : result.uncertainty.level === 'medium' ? 'Middel' : 'Lav'}</span>
        </div>
        <BulletList items={result.uncertainty.missing} emptyText="Ingen væsentlige mangler registreret." />
        <div className="review-strip">
          <span>{result.reviewPlan.passes === 2 ? 'Produktionsregel: 2 Sonnet-pass' : 'Produktionsregel: 1 Sonnet-pass'}</span>
          {result.reviewPlan.humanReviewRecommended && <strong>Menneskelig juridisk vurdering anbefales</strong>}
        </div>
      </article>

      {result.citations.length > 0 && (
        <details className="card source-details">
          <summary>Kilder brugt i demoen ({result.citations.length})</summary>
          <div className="source-detail-list">
            {result.citations.map((citation) => {
              const source = DEMO_SOURCES[citation.sourceId];
              return (
                <div key={citation.sourceId}>
                  <strong>{citation.label}</strong>
                  <p className="muted">Status: {citation.status}{citation.locator ? ` · ${citation.locator}` : ''}</p>
                  {source && <p>{source.text}</p>}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}

function MessageAssistantView() {
  const [message, setMessage] = useState<string>(DEMO_MESSAGES.changedPickup);
  const [result, setResult] = useState<MessageAnalysisResult | null>(null);
  const trimmed = useMemo(() => message.trim(), [message]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed) return;
    setResult(analyzeDemoMessage(trimmed));
  }

  function loadSample(sample: keyof typeof DEMO_MESSAGES) {
    setMessage(DEMO_MESSAGES[sample]);
    setResult(null);
  }

  return (
    <>
      <section className="intro">
        <h2>Hvad har du fået?</h2>
        <p>Indsæt beskeden. Hvad nu? skiller det konkrete fra støjen og viser, hvad sagen faktisk understøtter.</p>
      </section>

      <form className="message-form" onSubmit={submit}>
        <label htmlFor="message">Modtaget besked</label>
        <textarea
          id="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Indsæt beskeden her …"
          rows={7}
          autoComplete="off"
          spellCheck
        />
        <div className="sample-row" aria-label="Demoeksempler">
          <span>Prøv:</span>
          <button type="button" onClick={() => loadSample('changedPickup')}>Torsdag kl. 16</button>
          <button type="button" onClick={() => loadSample('scoutCamp')}>Spejderlejr</button>
        </div>
        <button className="primary-button" type="submit" disabled={!trimmed}>Analysér besked</button>
      </form>

      {result ? <ResultView result={result} /> : (
        <section className="empty-state">
          <div className="empty-icon">≡</div>
          <h3>Analysen bliver kort og kildebaseret</h3>
          <p>Du får: hvad der kræver svar, hvad der kan ignoreres, sagskontekst, juridisk usikkerhed og et neutralt svarforslag.</p>
        </section>
      )}
    </>
  );
}

export function App() {
  const [activeArea, setActiveArea] = useState<'message' | 'documents'>('message');

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">?</div>
        <div>
          <p className="eyebrow">Hvad nu?</p>
          <h1>{activeArea === 'message' ? 'Beskedhjælp' : 'Dokumenter'}</h1>
        </div>
        <span className="demo-badge">M2 PREVIEW</span>
      </header>

      <section className="demo-notice" role="note">
        <strong>Sikker preview-tilstand</strong>
        <span>Beskedanalysen er syntetisk. Dokumenter parses lokalt i browseren og sendes ikke til Claude eller storage. Brug stadig ikke rigtige sagsdata i en offentlig preview-host.</span>
      </section>

      <nav className="area-tabs" aria-label="Hovedområder">
        <button className={activeArea === 'message' ? 'active' : ''} type="button" onClick={() => setActiveArea('message')}>Besked</button>
        <button className={activeArea === 'documents' ? 'active' : ''} type="button" onClick={() => setActiveArea('documents')}>Dokument</button>
      </nav>

      {activeArea === 'message' ? <MessageAssistantView /> : <DocumentsView />}

      <footer>M2a · syntetisk analyse + lokal dokument-extraction · ingen produktion eller persistence</footer>
    </main>
  );
}
