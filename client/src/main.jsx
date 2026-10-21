import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { deviceLang, setLang } from './i18n/index.js';
import App from './App.jsx';
import { initTheme } from './lib/theme.js';
import { ErrorBoundary } from './components/Loading.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ops.css';

// Until a user is logged in, the interface speaks the device's language (last used here, else the browser's).
setLang(deviceLang());
// public/theme.js painted the theme before this script ran; from here on it follows the device (or the account, once loaded).
initTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
