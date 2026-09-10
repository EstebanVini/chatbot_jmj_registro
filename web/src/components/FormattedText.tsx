import { useMemo, type ReactNode } from 'react';
import { parseMessageText, type TextToken } from '../utils/formatText';

export interface FormattedTextProps {
  text: string;
}

/**
 * Recursively converts parsed TextToken objects into React elements.
 */
function renderTokens(tokens: TextToken[], keyPrefix = 'tok'): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (token.type) {
      case 'text':
        return token.content;
      case 'link':
        return (
          <a key={key} href={token.href} target="_blank" rel="noreferrer">
            {token.text}
          </a>
        );
      case 'bold':
        return (
          <strong key={key}>
            {renderTokens(token.children, `${key}-b`)}
          </strong>
        );
      case 'italic':
        return (
          <em key={key}>
            {renderTokens(token.children, `${key}-i`)}
          </em>
        );
    }
  });
}

/**
 * Component that renders WhatsApp-formatted text:
 * - `*text*` as bold (<strong>)
 * - `_text_` as italic (<em>)
 * - URLs as clickable links (<a>)
 */
export function FormattedText({ text }: FormattedTextProps) {
  const tokens = useMemo(() => parseMessageText(text), [text]);

  return <>{renderTokens(tokens)}</>;
}
