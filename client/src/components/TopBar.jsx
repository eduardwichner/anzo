import { Link } from 'react-router-dom';
import { IconBack } from '../icons/index.jsx';
import { t } from '../i18n/index.js';

export default function TopBar({ title, backTo = '/', children }) {
  return (
    <header className="topbar">
      <Link to={backTo} className="icon-btn" aria-label={t('app.back')}>
        <IconBack />
      </Link>
      <h1>{title}</h1>
      {children}
    </header>
  );
}
