/**
 * Token representation for formatted chat text.
 */
export type TextToken =
  | { type: 'text'; content: string }
  | { type: 'link'; href: string; text: string }
  | { type: 'bold'; children: TextToken[] }
  | { type: 'italic'; children: TextToken[] };

/**
 * Regular expression matching standard URLs (http/https).
 */
export const URL_REGEX = /(https?:\/\/[^\s]+)/g;

/**
 * Regular expression for WhatsApp-style formatting (*bold* and _italic_).
 * 
 * Rules enforced:
 * - Opening delimiter must be preceded by start of string, whitespace, or punctuation (non-alphanumeric).
 *   This avoids matching snake_case identifiers (e.g. `foo_bar`).
 * - Delimiters must not have inner whitespace right next to them (e.g. `* bold *` is ignored).
 * - Delimiters cannot be empty (`**` or `__` are ignored).
 * - Formatting does not cross newlines (`\n`).
 * - Closing delimiter must be followed by end of string, whitespace, or punctuation (non-alphanumeric).
 */
export const FORMAT_REGEX =
  /(?:(?<=^|[^\p{L}\p{N}])\*([^\s*](?:[^\n*]*?[^\s*])?)\*(?=[^\p{L}\p{N}]|$))|(?:(?<=^|[^\p{L}\p{N}])_([^\s_](?:[^\n_]*?[^\s_])?)_(?=[^\p{L}\p{N}]|$))/gu;

const MAX_PARSE_DEPTH = 5;

/**
 * Recursively parses formatting delimiters (*bold* and _italic_) within a non-URL text segment.
 *
 * @param text The text chunk to parse
 * @param depth Current recursion depth to prevent potential stack overflow
 * @returns Array of structured tokens
 */
function parseFormattedSegments(text: string, depth = 0): TextToken[] {
  if (!text) return [];
  if (depth > MAX_PARSE_DEPTH) {
    return [{ type: 'text', content: text }];
  }

  const tokens: TextToken[] = [];
  let lastIndex = 0;
  const regex = new RegExp(FORMAT_REGEX);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text preceding the matched format delimiter
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        content: text.slice(lastIndex, match.index)
      });
    }

    const boldMatch = match[1];
    const italicMatch = match[2];

    if (boldMatch !== undefined) {
      tokens.push({
        type: 'bold',
        children: parseFormattedSegments(boldMatch, depth + 1)
      });
    } else if (italicMatch !== undefined) {
      tokens.push({
        type: 'italic',
        children: parseFormattedSegments(italicMatch, depth + 1)
      });
    }

    lastIndex = regex.lastIndex;
  }

  // Add any remaining text after the last match
  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      content: text.slice(lastIndex)
    });
  }

  return tokens;
}

/**
 * Parses chat message text into tokens:
 * 1. Segments URLs so they remain intact and clickable.
 * 2. Parses WhatsApp formatting (*bold*, _italic_) on non-URL text segments.
 *
 * @param text Raw message text
 * @returns Array of parsed tokens
 */
export function parseMessageText(text: string): TextToken[] {
  if (!text) return [];

  const parts = text.split(URL_REGEX);
  const result: TextToken[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    // Check if this part matches the URL pattern
    if (/^https?:\/\/[^\s]+$/.test(part)) {
      result.push({
        type: 'link',
        href: part,
        text: part
      });
    } else {
      result.push(...parseFormattedSegments(part));
    }
  }

  return result;
}
