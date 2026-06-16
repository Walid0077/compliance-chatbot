import { useState, useCallback } from 'react';
import { apiPost, apiPostForm } from '../api/client';

export function useChat(password) {
  const [sessions, setSessions] = useState([
    { id: crypto.randomUUID(), messages: [], createdAt: new Date().toISOString() }
  ]);
  const [activeSessionIndex, setActiveSessionIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const activeSession = sessions[activeSessionIndex] || sessions[0];
  const messages = activeSession?.messages || [];
  const sessionId = activeSession?.id;

  async function sendMessage(text, file = null) {
    const userMsg = {
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
      fileName: file ? file.name : null,
      fileType: file ? file.type : null,
      filePreview: file && file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : null,
    };
    setSessions((prev) => {
      const updated = [...prev];
      updated[activeSessionIndex] = {
        ...updated[activeSessionIndex],
        messages: [...updated[activeSessionIndex].messages, userMsg],
      };
      return updated;
    });
    setIsLoading(true);

    try {
      let data;
      if (file) {
        const form = new FormData();
        form.append('message', text);
        form.append('sessionId', sessionId);
        form.append('file', file);
        data = await apiPostForm('/api/chat', form, password);
      } else {
        data = await apiPost('/api/chat', { message: text, sessionId }, password);
      }
      const botMsg = {
        role: 'bot',
        text: data.reply,
        timestamp: new Date().toISOString(),
        sourceCount: data.sourceCount ?? 0,
        sources: data.sources || [],
        citations: data.citations || [],
        classification: data.classification || null,
      };
      setSessions((prev) => {
        const updated = [...prev];
        updated[activeSessionIndex] = {
          ...updated[activeSessionIndex],
          messages: [...updated[activeSessionIndex].messages, botMsg],
        };
        return updated;
      });
    } catch (err) {
      if (err.message === 'UNAUTHORIZED') throw err;
      const errMsg = { role: 'error', text: err.message, timestamp: new Date().toISOString() };
      setSessions((prev) => {
        const updated = [...prev];
        updated[activeSessionIndex] = {
          ...updated[activeSessionIndex],
          messages: [...updated[activeSessionIndex].messages, errMsg],
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }

  const newSession = useCallback(() => {
    const session = { id: crypto.randomUUID(), messages: [], createdAt: new Date().toISOString() };
    setSessions((prev) => [...prev, session]);
    setActiveSessionIndex((prev) => prev + 1);
  }, []);

  return { messages, isLoading, sendMessage, sessionId, sessions, activeSessionIndex, setActiveSessionIndex, newSession };
}
