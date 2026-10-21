import { t } from '../i18n/index.js';

/**
 * "How this works": an explanation that opens with a tap, for pages whose mechanism the admin will not
 * remember months later. `prefix`: the i18n section with `title` and one `<part>.title` / `<part>.text` pair per part.
 */
export default function HowItWorks({ prefix, parts, testId = 'how-it-works' }) {
  return (
    <details className="how-it-works" data-testid={testId}>
      <summary>{t(`${prefix}.title`)}</summary>
      <dl>
        {parts.map((p) => (
          <div key={p} className="how-part">
            <dt>{t(`${prefix}.${p}.title`)}</dt>
            <dd>{t(`${prefix}.${p}.text`)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
