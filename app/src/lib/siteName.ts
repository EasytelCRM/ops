/**
 * Default site names, worked out from the address.
 *
 * The rule: a site is named after its suburb. If another of the client's sites is in
 * the same suburb, use the street name instead; if that site is on the same street too,
 * use the street number and street name.
 */

const STATES = 'NSW|VIC|QLD|SA|WA|TAS|ACT|NT';
const STREET_TYPES =
  'Street|St|Road|Rd|Avenue|Ave|Av|Highway|Hwy|Drive|Dr|Parade|Pde|Crescent|Cres|Place|Pl|Court|Ct|Crt|Lane|Ln|Circuit|Cct|Way|Boulevard|Boulevarde|Blvd|Terrace|Tce|Close|Cl|Square|Grove|Gr|Parkway|Esplanade|Mall|Row|Arcade|Plaza';

const stateRe = new RegExp(`^(.*?),?\\s+(?:${STATES})\\b\\s*\\d{0,4}\\.?\\s*$`, 'i');
const typeRe = new RegExp(`\\b(?:${STREET_TYPES})\\b`, 'i');
const splitRe = new RegExp(`^(.*\\b(?:${STREET_TYPES}))\\b\\.?\\s+(.+)$`, 'i');

/** "BELLA VISTA" / "bella vista" → "Bella Vista"; capitals inside a word (e.g. "McGraths") are kept. */
function fixCase(s: string): string {
  const base = s === s.toUpperCase() ? s.toLowerCase() : s;
  return base.replace(/(^|\s)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
}

export interface AddressParts {
  suburb: string;
  street: string;
  number: string;
}

/** Best-effort split of an Australian address into suburb, street name and street number. */
export function parseAddress(address: string): AddressParts {
  const a = address.trim().replace(/\s+/g, ' ');
  const m = a.match(stateRe);
  const parts = (m ? m[1] : a)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  let suburb = '';
  if (m) {
    let last = parts.pop() ?? '';
    // No comma between street and suburb: "190 Forrest Way Belrose NSW 2085"
    if (/\d/.test(last) || (typeRe.test(last) && parts.length === 0)) {
      const t = last.match(splitRe);
      if (t && !/\d/.test(t[2])) {
        parts.push(t[1]);
        last = t[2];
      } else {
        parts.push(last);
        last = '';
      }
    }
    suburb = last;
  } else if (parts.length > 1 && !/\d/.test(parts[parts.length - 1])) {
    suburb = parts.pop()!;
  }

  const streetPart = [...parts].reverse().find((p) => typeRe.test(p)) ?? parts[parts.length - 1] ?? '';
  let number = '';
  let street = streetPart;
  const sm = streetPart.match(/(?:^|\s)(?:\d+[a-z]?\s*\/\s*)?(\d+[a-z]?(?:\s*-\s*\d+[a-z]?)?)\s+([a-z].*)$/i);
  if (sm) {
    number = sm[1].replace(/\s/g, '');
    street = sm[2];
  } else {
    const s2 = streetPart.match(/^(?:.*\/\s*)?([a-z].*)$/i);
    if (s2) street = s2[1];
  }
  street = street.replace(/\b(?:cnr|corner)\b.*$/i, '').trim();

  return { suburb: fixCase(suburb.trim()), street: fixCase(street), number };
}

/**
 * The default name for a site at `address`, given the addresses of the client's other
 * sites. Returns '' when the address has no readable suburb.
 */
export function suggestSiteName(address: string, otherAddresses: string[]): string {
  const me = parseAddress(address);
  if (!me.suburb) return '';
  const others = otherAddresses.filter((o) => o.trim()).map(parseAddress);
  const lc = (s: string) => s.toLowerCase();
  const sameSuburb = others.filter((o) => lc(o.suburb) === lc(me.suburb));
  if (!sameSuburb.length || !me.street) return me.suburb;
  if (sameSuburb.some((o) => lc(o.street) === lc(me.street))) return `${me.number} ${me.street}`.trim();
  return me.street;
}

/** Placeholder for a site-name box: shows the name a blank box will get. */
export function sitePlaceholder(suggestion: string): string {
  return suggestion ? `${suggestion} (from address)` : 'Site name (blank = suburb)';
}
