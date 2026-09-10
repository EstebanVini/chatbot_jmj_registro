import type { Message } from '../api';
import { PhotoView } from 'react-photo-view';
import { FormattedText } from './FormattedText';
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
      const src = message.media_url || `/api/media/${message.media_id}`;
      return (
        <PhotoView src={src}>
          <img src={src} alt="Adjunto" className="bubble-image" style={{ cursor: 'pointer' }} />
        </PhotoView>
      );
    }
    if (isPdf) {
      const src = message.media_url || `/api/media/${message.media_id}`;
      return (
        <a href={src} target="_blank" rel="noreferrer" className="bubble-pdf">
          📄 Documento PDF
        </a>
      );
    }
    return null;
  };

  // Convert URLs to links and handle WhatsApp formatting (*bold*, _italic_)
  const renderText = () => {
    if (!message.text) return null;
    return (
      <p className="bubble-text">
        <FormattedText text={message.text} />
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
