import { getLang } from '../i18n/index.js';

/** Date and time in the interface language (not the device's locale): "3 Oct 2026, 09:41" / "3 okt 2026, 09:41". */
export const dateTime = (iso) => new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
