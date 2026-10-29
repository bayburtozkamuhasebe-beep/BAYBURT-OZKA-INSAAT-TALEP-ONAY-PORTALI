import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initSecurityGuard } from './lib/securityGuard';

// Geliştirici araçları (F12, İncele) engelleme ve konsol gizliliği
initSecurityGuard();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
