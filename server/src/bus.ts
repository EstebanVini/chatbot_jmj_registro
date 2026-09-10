import { Response } from 'express';

type ClientSet = Set<Response>;
const clientsBySession = new Map<string, ClientSet>();

export const bus = {
  addClient(sessionId: string, res: Response) {
    let clients = clientsBySession.get(sessionId);
    if (!clients) {
      clients = new Set();
      clientsBySession.set(sessionId, clients);
    }
    clients.add(res);

    res.on('close', () => {
      clients?.delete(res);
      if (clients?.size === 0) {
        clientsBySession.delete(sessionId);
      }
    });
  },

  emitMessage(sessionId: string, message: any) {
    const clients = clientsBySession.get(sessionId);
    if (clients) {
      const data = `data: ${JSON.stringify(message)}\n\n`;
      for (const res of clients) {
        res.write(`event: mensaje\n`);
        res.write(data);
      }
    }
  },

  emitTyping(sessionId: string) {
    const clients = clientsBySession.get(sessionId);
    if (clients) {
      for (const res of clients) {
        res.write(`event: escribiendo\ndata: {}\n\n`);
      }
    }
  }
};

// Keep-alive ping every 25 seconds
setInterval(() => {
  for (const clients of clientsBySession.values()) {
    for (const res of clients) {
      res.write(`event: ping\ndata: {}\n\n`);
    }
  }
}, 25000);
