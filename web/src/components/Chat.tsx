import { useEffect, useState, useRef, useMemo } from 'react';
import { type Session, type Message, fetchSession, closeSession, sendMessageText, sendMessageMedia, subscribeToStream, newSession } from '../api';
import { Bubble } from './Bubble';
import { Composer } from './Composer';
import { QuickReplies } from './QuickReplies';
import { getQuickReplies } from '../quickReplies';
import { ThemeToggle } from './ThemeToggle';
import './Chat.css';

interface ChatProps {
  session: Session;
  onLogout: () => void;
  onNewSession: () => void;
}

export function Chat({ session, onLogout, onNewSession }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState(session.status);
  const [typing, setTyping] = useState(false);
  const [connected, setConnected] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  
  // Ref for timer
  const typingTimerRef = useRef<number | undefined>(undefined);
  const warningTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    fetchSession().then((res) => {
      if (res) {
        setMessages(res.messages);
        setStatus(res.session.status);
      }
    });
  }, []);

  useEffect(() => {
    let lastSeq = 0;
    if (messages.length > 0) {
      lastSeq = Math.max(...messages.map(m => m.seq));
    }
    
    let reconnectTimeout: number;
    let delay = 1000;

    const connect = () => {
      const cleanup = subscribeToStream(
        lastSeq,
        (msg) => {
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg].sort((a, b) => a.seq - b.seq);
          });
          setTyping(false);
          clearTimeout(typingTimerRef.current);
          clearTimeout(warningTimerRef.current);
          lastSeq = msg.seq;
          
          if (msg.text && (msg.text.includes('Ha creado correctamente su registro') || 
                           msg.text.includes('Registro exitoso') || 
                           msg.text.includes('No es posible realizar el registro'))) {
            setStatus('completada');
          }
        },
        () => {
          setTyping(true);
          clearTimeout(typingTimerRef.current);
          typingTimerRef.current = window.setTimeout(() => setTyping(false), 3000);
        },
        () => {
          setConnected(true);
          delay = 1000;
        },
        () => {
          setConnected(false);
          cleanup();
          reconnectTimeout = window.setTimeout(connect, delay);
          delay = Math.min(delay * 2, 10000);
        }
      );
      return cleanup;
    };

    const cleanup = connect();
    return () => {
      cleanup();
      clearTimeout(reconnectTimeout);
      clearTimeout(typingTimerRef.current);
      clearTimeout(warningTimerRef.current);
    };
  }, [messages.length > 0 ? null : 'init']); // Re-evaluate only once or carefully to avoid infinite loop.
  // Wait, the dependency array here might be tricky if we want to update lastSeq correctly without reconnecting.
  // Actually, `subscribeToStream` closure captures the variables. If we don't put messages in deps, it will only connect once, and `lastSeq` will update in the closure. This is correct.

  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, typing, autoScroll]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isAtBottom);
  };

  const handleSendText = async (text: string) => {
    const tempId = Date.now().toString();
    const newMsg: Message = {
      id: tempId,
      seq: messages.length ? Math.max(...messages.map(m => m.seq)) + 1 : 1, // temporary seq
      author: 'persona',
      kind: 'texto',
      text,
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, newMsg]);
    setAutoScroll(true);
    setTyping(true); // show typing while bot processes (or wait for first ping)
    
    warningTimerRef.current = window.setTimeout(() => {
      // 45s warning
      setTyping(false);
      alert('El registro está tardando más de lo normal. Puede volver a escribir.');
    }, 45000);

    try {
      const savedMsg = await sendMessageText(text);
      setMessages(prev => prev.map(m => m.id === tempId ? savedMsg : m));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMedia = async (file: File) => {
    const tempId = Date.now().toString();
    const newMsg: Message = {
      id: tempId,
      seq: messages.length ? Math.max(...messages.map(m => m.seq)) + 1 : 1,
      author: 'persona',
      kind: 'archivo',
      text: file.name,
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, newMsg]);
    setAutoScroll(true);
    setTyping(true);

    warningTimerRef.current = window.setTimeout(() => {
      setTyping(false);
      alert('El registro está tardando más de lo normal. Puede volver a escribir.');
    }, 45000);

    try {
      const savedMsg = await sendMessageMedia(file);
      setMessages(prev => prev.map(m => m.id === tempId ? savedMsg : m));
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Si sale, este registro quedará incompleto y tendrá que empezar de nuevo.')) {
      await closeSession();
      onLogout();
    }
  };

  const handleNewPerson = async () => {
    await newSession();
    onNewSession();
  };

  const pendingBotReply = useMemo(() => {
    if (messages.length === 0) return false;
    const lastMsg = messages[messages.length - 1];
    return lastMsg.author === 'persona' || typing;
  }, [messages, typing]);

  const quickReplies = useMemo(() => {
    if (messages.length === 0) return [];
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.author !== 'bot') return [];
    return getQuickReplies(lastMsg.text || '') || [];
  }, [messages]);

  const onQuickReply = (opt: string) => {
    if (opt === 'Enviar otra foto') {
      // Find a way to trigger file input... 
      // A bit hacky, but we can just let them use the composer's clip.
      alert('Por favor use el icono 📎 (clip) para subir su foto.');
    } else {
      handleSendText(opt);
    }
  };

  const getFormUrl = () => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.author === 'bot' && msg.text) {
        const match = msg.text.match(/(https:\/\/[^\s]+)/);
        if (match) return match[1];
      }
    }
    return 'https://registro.eviniegra.software';
  };

  const isCompleted = status === 'completada' || status === 'cerrada';
  const disableComposer = isCompleted || (pendingBotReply && !typing && quickReplies.length === 0);
  
  return (
    <div className="chat-layout">
      {!connected && (
        <div className="offline-banner">
          Sin conexión. Reintentando...
        </div>
      )}
      
      <header className="chat-header">
        <div className="header-info">
          <img src="/WYD_Seoul_2027_Official_logo.png" alt="Logo JMJ" className="header-logo" />
          <div className="header-text">
            <h2>JMJ Corea 2027</h2>
            <span className="email">{session.email}</span>
          </div>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <button className="menu-btn" onClick={handleLogout}>⏻</button>
        </div>
      </header>

      <div className="chat-scroll" ref={scrollContainerRef} onScroll={handleScroll}>
        <div className="chat-history">
          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
          {typing && (
            <div className="bubble-wrapper bot">
              <div className="bubble typing-bubble">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {!autoScroll && (
        <button className="scroll-bottom-btn" onClick={() => setAutoScroll(true)}>
          Ver mensajes nuevos
        </button>
      )}

      <div className="chat-footer">
        {isCompleted ? (
          <div className="completed-actions">
            <button className="action-btn primary" onClick={() => window.open(getFormUrl(), '_blank')}>
              Abrir mi formulario
            </button>
            <button className="action-btn secondary" onClick={handleNewPerson}>
              Registrar a otra persona
            </button>
          </div>
        ) : (
          <>
            {!pendingBotReply && <QuickReplies options={quickReplies} onSelect={onQuickReply} disabled={disableComposer} />}
            <Composer 
              onSendText={handleSendText} 
              onSendMedia={handleSendMedia} 
              disabled={disableComposer}
              onFocus={() => setAutoScroll(true)}
            />
          </>
        )}
      </div>
    </div>
  );
}
