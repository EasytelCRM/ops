import { useState } from 'react';
import { askForAlerts, canAskForAlerts, type ActivePop } from '../../lib/screenPop';

/** The most clients a shared number lists as buttons; the rest are reached by searching. */
const MAX_CHOICES = 4;

/** "You just answered a call from …". Sits where the update bar does, below it if both show. */
export function CallBar({
  pop,
  belowUpdateBar,
  onOpen,
  onSearch,
  onDismiss,
}: {
  pop: ActivePop;
  belowUpdateBar: boolean;
  onOpen: (clientId: string) => void;
  onSearch: (q: string) => void;
  onDismiss: () => void;
}) {
  const [askAlerts, setAskAlerts] = useState(canAskForAlerts);
  const { clients, number, callerName, opened } = pop;
  const name = (c: (typeof clients)[number]) => (c.cancelled ? `${c.company} (cancelled)` : c.company);

  // Webex's caller ID name helps place a number the CRM doesn't know
  const who = callerName ? ` (${callerName})` : '';
  let text: string;
  if (clients.length === 1) text = `Call from ${name(clients[0])}${number ? ` · ${number}` : ''}`;
  else if (clients.length > 1) text = `Call from ${number}${who}, shared by ${clients.length} clients:`;
  else if (number) text = `Call from an unknown number, ${number}${who}`;
  else text = 'Call from a withheld number';

  return (
    <div
      className="update-bar"
      style={{ flexWrap: 'wrap', ...(belowUpdateBar ? { top: '3.75rem' } : {}) }}
      role="status"
    >
      <i className="ti ti-phone-call" />
      <span>{text}</span>

      {clients.length === 1 && !opened && (
        <button className="btn btn-primary btn-sm" onClick={() => onOpen(clients[0].id)}>
          Open client
        </button>
      )}
      {clients.length > 1 &&
        clients.slice(0, MAX_CHOICES).map((c) => (
          <button key={c.id} className="btn btn-primary btn-sm" onClick={() => onOpen(c.id)}>
            {name(c)}
          </button>
        ))}
      {(clients.length === 0 || clients.length > MAX_CHOICES) && (
        <button className="btn btn-primary btn-sm" onClick={() => onSearch(number ?? '')}>
          <i className="ti ti-search" /> Search clients
        </button>
      )}

      {askAlerts && (
        <button
          className="btn btn-sm"
          title="Show a desktop notification when a call comes in while the CRM is in the background"
          onClick={() => void askForAlerts().then(() => setAskAlerts(canAskForAlerts()))}
        >
          <i className="ti ti-bell" /> Desktop alerts
        </button>
      )}
      <button className="btn btn-sm" title="Dismiss" onClick={onDismiss}>
        <i className="ti ti-x" />
      </button>
    </div>
  );
}
