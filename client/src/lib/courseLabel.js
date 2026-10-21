import { t } from '../i18n/index.js';

// A course as the admin screens name it: "French for English speakers". A course's own name (languages.<track>) says only the
// language it teaches, which two courses may share (fr and fr-en both teach French).
export const courseLabel = ({ targetLang, nativeLang }) => t('ops.corrections.courseFor', {
  language: t(`languages.${targetLang}`),
  native: t(`nativeLanguages.${nativeLang}`),
});
