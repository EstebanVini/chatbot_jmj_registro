import type { Message } from '../api';
import './Bubble.css';

interface BubbleProps {
  message: Message;
}

export function Bubble({ message }: BubbleProps) {
  const isBot = message.author === 'bot';
  const isImage = message.kind === 'archivo' && (message.media_url || message.media_id);
  const isPdf = message.kind === 'archivo' && message.text?.endsWith('.pdf');

  // Simple render logic for files
  const renderMedia = () => {
    if (isImage) {
      const src = message.media_url || `/media/${message.media_id}`;
      return <img src={src} alt="Adjunto" className="bubble-image" onClick={() => window.open(src, '_blank')} />;
    }
    if (isPdf) {
      const src = message.media_url || `/media/${message.media_id}`;
      return (
        <a href={src} target="_blank" rel="noreferrer" className="bubble-pdf">
          📄 Documento PDF
        </a>
      );
    }
    return null;
  };

  // Convert URLs to links and handle basic text formatting
  const renderText = () => {
    if (!message.text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = message.text.split(urlRegex);
    return (
      <p className="bubble-text">
        {parts.map((part, i) => {
          if (part.match(urlRegex)) {
            return (
              <a key={i} href={part} target="_blank" rel="noreferrer">
                {part}
              </a>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </p>
    );
  };

  return (
    <div className={`bubble-wrapper ${isBot ? 'bot' : 'persona'}`}>
      <div className="bubble">
        {renderMedia()}
        {renderText()}
        <span className="bubble-time">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
