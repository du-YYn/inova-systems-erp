/**
 * URL safety helpers.
 *
 * `safeHref` returns the input only when it parses as an absolute URL whose
 * scheme is in the allow-list (`http`, `https`, `mailto`). For any other input
 * — including `javascript:`, `data:`, `vbscript:`, file paths, malformed URLs,
 * or relative paths — it returns `undefined`. Callers should fall back to
 * rendering plain text when `undefined` is returned, or omit the `href`.
 *
 * Why: user-supplied URLs flow into `<a href={apiValue}>` for fields like
 * project links, contract meeting URLs and similar. Without filtering, an
 * attacker who can write to those fields can inject `javascript:alert(1)`
 * and trigger XSS on click.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return undefined;
  return parsed.toString();
}

export function isSafeHref(value: unknown): boolean {
  return safeHref(value) !== undefined;
}
