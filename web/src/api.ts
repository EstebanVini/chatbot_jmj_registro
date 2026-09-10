export interface Session {
  sessionId: string;
  email: string;
  status: 'activa' | 'completada' | 'cerrada';
}

export interface Message {
  id: string;
  seq: number;
  author: 'persona' | 'bot';
  kind: 'texto' | 'archivo';
  text: string;
  media_id?: string;
  media_url?: string;
  createdAt: string;
}

export async function fetchSession(): Promise<{ session: Session; messages: Message[] } | null> {
  const res = await fetch('/api/session');
  if (res.status === 204) return null;
  if (!res.ok) throw new Error('Failed to fetch session');
  return res.json();
}

export async function createSession(email: string): Promise<Session> {
  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function closeSession(): Promise<void> {
  await fetch('/api/session', { method: 'DELETE' });
}

export async function newSession(): Promise<Session> {
  const res = await fetch('/api/session/nueva', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create new session');
  return res.json();
}

export async function sendMessageText(text: string): Promise<Message> {
  const res = await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error('Failed to send message');
  return res.json();
}

export async function sendMessageMedia(file: File, text?: string): Promise<Message> {
  const formData = new FormData();
  formData.append('file', file);
  if (text) formData.append('text', text);

  const res = await fetch('/api/messages', {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Failed to send media');
  return res.json();
}

export function subscribeToStream(
  lastSeq: number,
  onMessage: (msg: Message) => void,
  onTyping: () => void,
  onConnected: () => void,
  onDisconnected: () => void
) {
  let url = '/api/stream';
  if (lastSeq > 0) {
    url += `?desde=${lastSeq}`;
  }
  
  const eventSource = new EventSource(url);
  
  eventSource.onopen = () => {
    onConnected();
  };
  
  eventSource.onerror = () => {
    onDisconnected();
  };

  eventSource.addEventListener('mensaje', (e) => {
    try {
      const msg = JSON.parse(e.data);
      onMessage(msg);
    } catch (err) {
      console.error('Error parsing message', err);
    }
  });

  eventSource.addEventListener('escribiendo', () => {
    onTyping();
  });

  return () => {
    eventSource.close();
  };
}
