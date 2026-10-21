import { Component } from 'react';
import { useLocation } from 'react-router-dom';
import { t } from '../i18n/index.js';
import Button from './Button.jsx';

export function Loading() {
  return (
    <div className="page"><div className="center muted" role="status">{t('app.loading')}</div></div>
  );
}

/**
 * The generic error screen, always recoverable: "Try again" reloads the screen's data (or the page when the caller has no
 * loader), "Back to Home" reloads the app at Home. A full load, so nothing in memory from the failed state survives.
 */
export function LoadError({ onRetry }) {
  return (
    <div className="page" data-testid="load-error">
      <div className="center stack">
        <p role="alert">{t('app.error')}</p>
        <Button onClick={() => (onRetry ? onRetry() : window.location.reload())} data-testid="error-retry">{t('app.retry')}</Button>
        <Button variant="secondary" onClick={() => window.location.assign('/')} data-testid="error-home">{t('lesson.backHome')}</Button>
      </div>
    </div>
  );
}

class Boundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, at: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    // Navigating elsewhere (Back to Home inside the app, the browser's back button) clears the error.
    return props.resetKey !== state.at ? { error: null, at: props.resetKey } : null;
  }

  componentDidCatch(error) {
    console.error('anzo: screen failed', error);
  }

  render() {
    if (this.state.error) return <LoadError onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

/** Catches a screen that throws while rendering: the recoverable error screen instead of an empty page. */
export function ErrorBoundary({ children }) {
  const location = useLocation();
  return <Boundary resetKey={location.pathname}>{children}</Boundary>;
}
