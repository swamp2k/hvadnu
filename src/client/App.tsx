import { useState } from 'react';
import { CurrentCaseView } from './CurrentCaseView';
import { DocumentsView } from './DocumentsView';
import { MessageAssistantView } from './MessageAssistantView';

type ActiveArea = 'message' | 'documents' | 'case';

export function App() {
  const [activeArea, setActiveArea] = useState<ActiveArea>('message');
  const heading = activeArea === 'message' ? 'Beskedhjælp' : activeArea === 'documents' ? 'Dokumenter' : 'Sagen';

  return (
    <main className="app-shell">
      <header className="topbar"><div className="brand-mark">?</div><div><p className="eyebrow">Hvad nu?</p><h1>{heading}</h1></div><span className="demo-badge">M3c PRIVATE</span></header>
      <section className="demo-notice" role="note"><strong>Privat testtilstand</strong><span>Dokumenter gemmes kun efter “Gem i sagen”. Beskeder gemmes automatisk efter en vellykket live-analyse sammen med analysen og svarforslaget, så samtalehistorikken kan bruges som kildegrundlag senere.</span></section>
      <nav className="area-tabs" aria-label="Hovedområder">
        <button className={activeArea === 'message' ? 'active' : ''} type="button" onClick={() => setActiveArea('message')}>Besked</button>
        <button className={activeArea === 'documents' ? 'active' : ''} type="button" onClick={() => setActiveArea('documents')}>Dokument</button>
        <button className={activeArea === 'case' ? 'active' : ''} type="button" onClick={() => setActiveArea('case')}>Sagen</button>
      </nav>
      {activeArea === 'message' ? <MessageAssistantView /> : activeArea === 'documents' ? <DocumentsView /> : <CurrentCaseView />}
      <footer>M3c · live besked- og dokumentanalyse · EU D1 historik · current-state promotion er særskilt</footer>
    </main>
  );
}
