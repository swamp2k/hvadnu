import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type { DocumentExplanation, ExtractedDocument } from '../domain/document';
import { extractDocumentLocally } from '../documents/extract-document';
import { explainSyntheticDocument, SYNTHETIC_DOCUMENT_TEXT } from '../documents/synthetic-document';
import { saveAnalyzedDocumentToCase, CaseApiError } from './case-api';
import {
  analyzeDocument,
  DocumentAnalysisApiError,
  getDocumentAnalysisStatus,
} from './document-analysis-api';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Explanation({ explanation }: { explanation: DocumentExplanation }) {
  return (
    <section className="document-stack" aria-live="polite">
      <div className="result-heading">
        <div>
          <p className="eyebrow">Dokumentforklaring</p>
          <h2>{explanation.title}</h2>
        </div>
        <span className="status-pill status-uncertain">{explanation.sourceStatus === 'proposal' ? 'Forslag' : explanation.sourceStatus}</span>
      </div>

      <article className="card summary-card"><p>{explanation.summary}</p></article>

      <article className="card">
        <h3>Hvad betyder det?</h3>
        <ul className="bullet-list">{explanation.whatItMeans.map((item) => <li key={item}>{item}</li>)}</ul>
      </article>

      <article className="card">
        <h3>Det skal der tages stilling til</h3>
        <ul className="bullet-list">{explanation.actions.map((item) => <li key={item}>{item}</li>)}</ul>
      </article>

      {explanation.deadlines.map((deadline) => (
        <article className="card deadline-card" key={`${deadline.label}-${deadline.date ?? 'unknown'}`}>
          <div className="section-title-row"><h3>Dato / frist</h3><span className="source-count">{deadline.date ?? 'ukendt'}</span></div>
          <strong>{deadline.label}</strong>
          <p className="muted">Kilde: {deadline.source}</p>
        </article>
      ))}

      <details className="card source-details">
        <summary>Vigtige passager ({explanation.importantPassages.length})</summary>
        <div className="source-detail-list">
          {explanation.importantPassages.map((passage) => (
            <div key={passage.locator}>
              <strong>{passage.locator}</strong>
              <p>{passage.text}</p>
            </div>
          ))}
        </div>
      </details>

      <article className="card uncertainty-card">
        <h3>Det ved vi ikke sikkert endnu</h3>
        <ul className="bullet-list">{explanation.uncertainty.map((item) => <li key={item}>{item}</li>)}</ul>
      </article>
    </section>
  );
}

interface ExtractionPreviewProps {
  document: ExtractedDocument;
  analysisAvailable: boolean | null;
  analysisWorking: boolean;
  onAnalyze: () => void;
}

function ExtractionPreview({ document, analysisAvailable, analysisWorking, onAnalyze }: ExtractionPreviewProps) {
  const text = useMemo(() => document.pages.map((page) => page.text).filter(Boolean).join('\n\n'), [document]);
  const preview = text.slice(0, 6000);
  const structureLabel = document.kind === 'pdf'
    ? `${document.pageCount} ${document.pageCount === 1 ? 'side' : 'sider'}`
    : '1 tekstblok';
  const hasText = document.characterCount > 0;
  const canAnalyze = analysisAvailable === true && hasText && !analysisWorking;

  let analysisMessage = 'Tjekker om den private AI-analyse er klar …';
  if (!hasText) {
    analysisMessage = 'Der er ingen maskinlæsbar tekst at sende til analyse. Dokumentet kræver OCR/vision først.';
  } else if (analysisAvailable === false) {
    analysisMessage = 'AI-analysen er ikke klar på serveren endnu. Dokumentet bliver på telefonen.';
  } else if (analysisAvailable === true) {
    analysisMessage = 'Kun den udtrukne tekst sendes til den private Hvad nu?-API og Sonnet 5. Originalfilen uploades ikke.';
  }

  return (
    <section className="document-stack" aria-live="polite">
      <article className="card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Lokal extraction</p>
            <h3 className="document-name">{document.name}</h3>
          </div>
          <span className="source-count">{document.kind.toUpperCase()}</span>
        </div>
        <div className="document-meta">
          <span>{formatBytes(document.sizeBytes)}</span>
          <span>{structureLabel}</span>
          <span>{document.characterCount.toLocaleString('da-DK')} tegn</span>
        </div>
      </article>

      {document.warnings.length > 0 && (
        <article className="card warning-card">
          <h3>Extraction-advarsel</h3>
          <ul className="bullet-list">{document.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </article>
      )}

      <article className="card extracted-text-card">
        <div className="section-title-row"><h3>Udtrukket tekst</h3><span className="local-only-badge">Kun lokalt indtil analyse</span></div>
        {preview ? <pre>{preview}{text.length > preview.length ? '\n\n… preview afkortet' : ''}</pre> : <p className="muted">Ingen maskinlæsbar tekst fundet.</p>}
      </article>

      <article className="card locked-analysis-card">
        <h3>Forklar dokumentet</h3>
        <p>{analysisMessage}</p>
        <button className="primary-button" type="button" disabled={!canAnalyze} onClick={onAnalyze}>
          {analysisWorking ? 'Analyserer …' : 'Forklar dokumentet'}
        </button>
      </article>
    </section>
  );
}

function analysisErrorMessage(error: unknown): string {
  if (error instanceof DocumentAnalysisApiError) {
    if (error.status === 401) return 'AI-adgangen er ikke konfigureret til denne bruger endnu.';
    if (error.status === 413) return 'Dokumentet er for stort til denne analysevej.';
    if (error.status === 503 || error.code === 'analysis_unavailable') return 'AI-analysen er ikke klar på serveren endnu.';
  }
  return 'Dokumentet kunne ikke analyseres. Ingen analyse er gemt; prøv igen senere.';
}

function saveErrorMessage(error: unknown): string {
  if (error instanceof CaseApiError) {
    if (error.status === 401) return 'Sagen kunne ikke gemmes, fordi Access-sessionen ikke blev godkendt.';
    if (error.status === 413) return 'Dokumentet er for stort til at gemme i denne version.';
    if (error.status === 503) return 'Sagsdatabasen er ikke klar endnu.';
  }
  return 'Dokumentet kunne ikke gemmes i sagen. Analysen er stadig synlig her og kan prøves gemt igen.';
}

export function DocumentsView() {
  const [extracted, setExtracted] = useState<ExtractedDocument | null>(null);
  const [explanation, setExplanation] = useState<DocumentExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [analysisWorking, setAnalysisWorking] = useState(false);
  const [saveWorking, setSaveWorking] = useState(false);
  const [savedSourceId, setSavedSourceId] = useState<string | null>(null);
  const [analysisAvailable, setAnalysisAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getDocumentAnalysisStatus().then((status) => {
      if (!cancelled) setAnalysisAvailable(status.available);
    });
    return () => { cancelled = true; };
  }, []);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setWorking(true);
    setError(null);
    setAnalysisError(null);
    setSaveError(null);
    setSavedSourceId(null);
    setExplanation(null);
    setExtracted(null);
    try {
      setExtracted(await extractDocumentLocally(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Dokumentet kunne ikke læses lokalt.');
    } finally {
      setWorking(false);
      event.target.value = '';
    }
  }

  async function handleAnalyze() {
    if (!extracted || analysisAvailable !== true) return;
    setAnalysisWorking(true);
    setAnalysisError(null);
    setSaveError(null);
    setSavedSourceId(null);
    setExplanation(null);
    try {
      setExplanation(await analyzeDocument(extracted));
    } catch (cause) {
      setAnalysisError(analysisErrorMessage(cause));
      if (cause instanceof DocumentAnalysisApiError && (cause.status === 401 || cause.status === 503)) {
        setAnalysisAvailable(false);
      }
    } finally {
      setAnalysisWorking(false);
    }
  }

  async function handleSave() {
    if (!extracted || !explanation || explanation.mode !== 'model_analysis' || savedSourceId) return;
    setSaveWorking(true);
    setSaveError(null);
    try {
      const saved = await saveAnalyzedDocumentToCase(extracted, explanation);
      setSavedSourceId(saved.sourceId);
    } catch (cause) {
      setSaveError(saveErrorMessage(cause));
    } finally {
      setSaveWorking(false);
    }
  }

  function loadSyntheticExplanation() {
    setExtracted(null);
    setError(null);
    setAnalysisError(null);
    setSaveError(null);
    setSavedSourceId(null);
    setExplanation(explainSyntheticDocument());
  }

  return (
    <>
      <section className="intro">
        <h2>Hvad står der egentlig?</h2>
        <p>Dokumentet læses først lokalt på telefonen. Analyse og lagring er to separate handlinger: intet gemmes i sagen, før du aktivt vælger det.</p>
      </section>

      <section className="document-upload card">
        <label className="upload-button">
          <span>{working ? 'Læser dokument …' : 'Vælg PDF, DOCX eller tekst'}</span>
          <input type="file" accept=".pdf,.docx,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFile} disabled={working || analysisWorking || saveWorking} />
        </label>
        <p className="muted compact">Maks. 25 MB generelt, 10 MB for DOCX og 300 PDF-sider i den lokale mobil-preview. Originalfilen uploades ikke.</p>
        <div className="document-demo-separator"><span>eller</span></div>
        <button className="secondary-button" type="button" onClick={loadSyntheticExplanation} disabled={analysisWorking || saveWorking}>Prøv syntetisk advokatbrev</button>
        <details className="synthetic-raw">
          <summary>Se teksten i det syntetiske dokument</summary>
          <pre>{SYNTHETIC_DOCUMENT_TEXT}</pre>
        </details>
      </section>

      {error && <section className="card error-card" role="alert"><strong>Kunne ikke læse dokumentet</strong><p>{error}</p></section>}
      {analysisError && <section className="card error-card" role="alert"><strong>Kunne ikke analysere dokumentet</strong><p>{analysisError}</p></section>}
      {saveError && <section className="card error-card" role="alert"><strong>Kunne ikke gemme i sagen</strong><p>{saveError}</p></section>}
      {extracted && (
        <ExtractionPreview
          document={extracted}
          analysisAvailable={analysisAvailable}
          analysisWorking={analysisWorking}
          onAnalyze={() => { void handleAnalyze(); }}
        />
      )}
      {explanation && <Explanation explanation={explanation} />}

      {extracted && explanation?.mode === 'model_analysis' && (
        <section className="card case-save-card" aria-live="polite">
          <h3>Gem i sagen</h3>
          <p>Dette gemmer den udtrukne tekst, dens SHA-256, den validerede analyse og en kildehenvist timeline-post i den private EU-database. Originalfilens bytes gemmes ikke.</p>
          <button className="primary-button" type="button" onClick={() => { void handleSave(); }} disabled={saveWorking || Boolean(savedSourceId)}>
            {savedSourceId ? 'Gemt i sagen' : saveWorking ? 'Gemmer …' : 'Gem i sagen'}
          </button>
        </section>
      )}

      {!extracted && !explanation && !error && (
        <section className="empty-state">
          <div className="empty-icon">▤</div>
          <h3>Original først, forklaring bagefter</h3>
          <p>Extraction, fortolkning og persistence er adskilt, så en AI-opsummering aldrig bliver forvekslet med selve dokumentet eller gemt ved et uheld.</p>
        </section>
      )}
    </>
  );
}
