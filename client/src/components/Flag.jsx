// Course flags (inline SVG, 3:2), one per target language of a course. The flag of the language taught, not of a country
// a child should associate with it exclusively: English uses the Union Jack, French the tricolour, Dutch the Dutch flag.
const FLAGS = {
  en: (
    <>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#fff" strokeWidth="8" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#C8102E" strokeWidth="3" />
      <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="12" />
      <path d="M30 0v40M0 20h60" stroke="#C8102E" strokeWidth="7" />
    </>
  ),
  fr: (
    <>
      <rect width="20" height="40" fill="#002395" />
      <rect x="20" width="20" height="40" fill="#fff" />
      <rect x="40" width="20" height="40" fill="#ED2939" />
    </>
  ),
  nl: (
    <>
      <rect width="60" height="13.34" fill="#AE1C28" />
      <rect y="13.33" width="60" height="13.34" fill="#fff" />
      <rect y="26.66" width="60" height="13.34" fill="#21468B" />
    </>
  ),
};

/**
 * The flag of a course's target language (`target`; a variant course such as fr-en shows its target's flag —
 * without `target` the track id is the language); a neutral rounded box for a language without one here.
 */
export default function Flag({ track, target, className = 'flag' }) {
  // a variant course's id starts with its target (fr-en): the fallback where only the id is known (the admin's own chip)
  const lang = target ?? (FLAGS[track] ? track : String(track).split('-')[0]);
  return (
    <svg className={className} viewBox="0 0 60 40" aria-hidden="true" focusable="false" data-flag={lang}>
      <clipPath id={`flag-clip-${track}`}><rect width="60" height="40" rx="6" /></clipPath>
      <g clipPath={`url(#flag-clip-${track})`}>{FLAGS[lang] ?? <rect width="60" height="40" fill="currentColor" opacity="0.25" />}</g>
    </svg>
  );
}
