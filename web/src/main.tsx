import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppWithConsent as App } from './App.js';
import './styles/global.css';

// StrictMode deaktiviert wegen Leaflet-Inkompatibilität mit React 19's
// reappearLayoutEffects (verursacht "Map container is already initialized").
// In Production hat StrictMode ohnehin keine Wirkung.
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
