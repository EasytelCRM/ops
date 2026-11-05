import { mailLink, telLink } from '../lib/format';

/**
 * Imported numbers can carry text ("0243119379 (New Number)"), so the link dials the
 * first run of digits while the text shows as typed. Same idea for email.
 */
export function Tel({ value }: { value: string }) {
  const href = telLink(value);
  return href ? <a href={href}>{value}</a> : <>{value}</>;
}

export function Mail({ value }: { value: string }) {
  const href = mailLink(value);
  return href ? <a href={href}>{value}</a> : <>{value}</>;
}

/** Links are rendered as hrefs, so only http(s) gets through (no javascript: etc.). */
export const safeTicketUrl = (url: string | null | undefined) =>
  /^https?:\/\//i.test(url ?? '') ? url! : null;

/** The little external-link icon next to a record's title when it has a ticket link. */
export function TicketLink({ url }: { url: string | null | undefined }) {
  const safe = safeTicketUrl(url);
  if (!safe) return null;
  return (
    <>
      {' '}
      <a
        href={safe}
        target="_blank"
        rel="noopener"
        title="Open ticket"
        onClick={(e) => e.stopPropagation()}
      >
        <i className="ti ti-external-link" />
      </a>
    </>
  );
}
