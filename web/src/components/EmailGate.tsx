import { useState } from 'react';
import { createSession } from '../api';
import { ThemeToggle } from './ThemeToggle';
import './EmailGate.css';

interface EmailGateProps {
  onSessionCreated: () => void;
}

export function EmailGate({ onSessionCreated }: EmailGateProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || !email.includes('.')) {
      setError('Por favor ingrese un correo válido.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await createSession(email.trim().toLowerCase());
      onSessionCreated();
    } catch (err) {
      setError('No se pudo crear la sesión. Intente nuevamente.');
      setLoading(false);
    }
  };

  return (
    <div className="email-gate">
      <div className="email-gate-card">
        <div className="gate-header">
          <h1 className="title">
            Registro de peregrinos<br />
            JMJ Corea 2027
          </h1>
          <ThemeToggle />
        </div>
        <p className="subtitle">Escriba su correo para comenzar.</p>
        
        <form onSubmit={handleSubmit} className="form">
          <input 
            type="email" 
            inputMode="email"
            autoComplete="email"
            autoFocus 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            disabled={loading}
          />
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={loading || !email}>
            {loading ? 'Cargando...' : 'Comenzar'}
          </button>
        </form>

        <hr className="divider" />
        
        <p className="info">
          Toda la comunicación sobre su registro y la peregrinación llegará a este correo. Revise que esté bien escrito.
        </p>
        <p className="info">
          Puede registrar a varias personas con el mismo correo.
        </p>
      </div>
    </div>
  );
}
