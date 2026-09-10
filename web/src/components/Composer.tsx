import { useState, useRef, useEffect } from 'react';
import './Composer.css';

interface ComposerProps {
  onSendText: (text: string) => void;
  onSendMedia: (file: File) => void;
  disabled: boolean;
  onFocus: () => void;
}

const MAX_SIZE_MB = 12;

export function Composer({ onSendText, onSendMedia, disabled, onFocus }: ComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 96)}px`; // Max ~4 lines
    }
  }, [text]);

  const handleSubmitText = () => {
    const trimmed = text.trim();
    if (trimmed && !disabled) {
      onSendText(trimmed);
      setText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitText();
    }
  };

  const resizeImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        const max = 2000;
        if (width > max || height > max) {
          if (width > height) {
            height = Math.round((height * max) / width);
            width = max;
          } else {
            width = Math.round((width * max) / height);
            height = max;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(file);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const resized = new File([blob], file.name, { type: 'image/jpeg' });
              resolve(resized);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`La imagen pesa más de ${MAX_SIZE_MB} MB. Tome la foto de nuevo con menos resolución o recórtela.`);
      return;
    }

    const isImage = file.type.startsWith('image/');
    if (!isImage && file.type !== 'application/pdf') {
      alert('Solo se aceptan fotos JPG o PNG y documentos PDF.');
      return;
    }

    try {
      let finalFile = file;
      if (isImage) {
        finalFile = await resizeImage(file);
      }
      onSendMedia(finalFile);
    } catch (err) {
      console.error(err);
      alert('Error procesando el archivo.');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="composer-container">
      <button 
        className="attach-btn" 
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
      >
        📎
      </button>
      <input 
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleFileChange}
      />
      <textarea
        ref={textareaRef}
        className="composer-textarea"
        placeholder="Escriba su respuesta…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        disabled={disabled}
        rows={1}
      />
      <button 
        className="send-btn"
        onClick={handleSubmitText}
        disabled={disabled || !text.trim()}
      >
        ➤
      </button>
    </div>
  );
}
