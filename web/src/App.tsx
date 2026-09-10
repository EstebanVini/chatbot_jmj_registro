import { useState, useEffect } from 'react';
import { fetchSession, type Session } from './api';
import { EmailGate } from './components/EmailGate';
import { Chat } from './components/Chat';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const checkSession = async () => {
    try {
      const res = await fetchSession();
      if (res) {
        setSession(res.session);
      } else {
        setSession(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  if (loading) {
    return null; // Or a simple spinner
  }

  if (!session) {
    return <EmailGate onSessionCreated={checkSession} />;
  }

  return <Chat key={session.sessionId} session={session} onLogout={checkSession} onNewSession={checkSession} />;
}

export default App;
