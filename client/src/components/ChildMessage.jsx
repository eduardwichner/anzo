import { useRef } from 'react';
import { t } from '../i18n/index.js';
import { useSheetFocus } from '../lib/useSheetFocus.js';
import Mascot from './Mascot.jsx';
import BadgeIcon from './BadgeIcon.jsx';
import Button from './Button.jsx';
import { badgeTitle } from '../lib/badges.js';

/**
 * A one-time message from the grown-ups on Home ("it was correct" / "your report fixed a mistake"), with the mascot.
 * A sheet over Home: Home scrolls to the current lesson, so an inline card could go unseen.
 */
export default function ChildMessage({ message, mascot, onDone }) {
  const badge = message.badge ? { id: message.badge, family: 'bug' } : null;
  const dialogRef = useRef(null);
  useSheetFocus(dialogRef, { onClose: onDone }); // its first control: OK
  return (
    <div className="bottom-sheet-backdrop" data-testid="child-message-backdrop">
    <section ref={dialogRef} className="bottom-sheet child-message" role="dialog" aria-modal="true" aria-labelledby="child-message-title"
      data-testid="child-message" data-kind={message.kind}>
      <Mascot kind={mascot} pose={message.kind === 'fixed' ? 'celebrating' : 'happy'} className="mascot mascot--message" testId="message-mascot" />
      <div className="stack child-message-body">
        <h2 id="child-message-title">{t('messages.title')}</h2>
        <p className="speech" data-testid="child-message-text">{message.text}</p>
        {badge && (
          <p className="row child-message-badge" data-testid="child-message-badge">
            <BadgeIcon badge={badge} className="badge-icon badge-icon--small" />
            <span>{t('messages.badge')} <strong>{badgeTitle(badge)}</strong></span>
          </p>
        )}
        <Button size="big" block onClick={onDone} data-testid="child-message-ok">{t('messages.ok')}</Button>
      </div>
    </section>
    </div>
  );
}
