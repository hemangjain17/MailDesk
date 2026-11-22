const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
]);

const HTML_TAG_REGEX = /<\/?[a-z][\s\S]*?>/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function isSafeHref(value: string): boolean {
  const href = value.trim();
  return (
    /^https?:\/\//i.test(href) ||
    /^mailto:/i.test(href) ||
    /^\{\{[a-zA-Z0-9_]+\}\}$/.test(href)
  );
}

/** Converts existing plain-text templates into editor-safe HTML. */
export function plainTextToHtml(value: string): string {
  if (!value) return '';
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

/** Returns sanitized HTML, while keeping old plain-text templates compatible. */
export function normalizeTemplateHtml(value: string): string {
  if (!value) return '';
  return sanitizeEmailHtml(HTML_TAG_REGEX.test(value) ? value : plainTextToHtml(value));
}

/**
 * Small allow-list sanitizer shared by previews and server-side email delivery.
 * Email templates only need basic formatting, lists, and safe links.
 */
export function sanitizeEmailHtml(value: string): string {
  if (!value) return '';

  const withoutDangerousBlocks = value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|svg|math)[^>]*\/?\s*>/gi, '');

  return withoutDangerousBlocks.replace(
    /<\s*(\/?)\s*([a-zA-Z0-9-]+)([^>]*)>/g,
    (full, closing: string, rawTag: string, rawAttributes: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';
      if (closing) return tag === 'br' ? '' : `</${tag}>`;
      if (tag === 'br') return '<br>';

      if (tag === 'a') {
        const hrefMatch = rawAttributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
        const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? '';
        if (!isSafeHref(href)) return '<span>';
        return `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">`;
      }

      return `<${tag}>`;
    }
  );
}

/** Produces the plain-text MIME fallback and text stored in message history. */
export function htmlToPlainText(value: string): string {
  if (!value) return '';
  const html = normalizeTemplateHtml(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<\/blockquote\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return html
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
