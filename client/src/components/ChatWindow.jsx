import { useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import logo from '../logo.jpeg';
import './ChatWindow.css';

const SUGGESTIONS = [
  'What are GDPR compliance requirements?',
  'Explain data retention policies',
  'What is a compliance audit?',
  'How to handle a data breach?',
];

export default function ChatWindow({ password, onUnauthorized }) {
  const { messages, isLoading, sendMessage, sessionId, newSession } = useChat(password);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(text, file = null) {
    try {
      await sendMessage(text, file);
    } catch (err) {
      if (err.message === 'UNAUTHORIZED') onUnauthorized();
    }
  }

  const msgCount = messages.length;
  const botMsgs = messages.filter((m) => m.role === 'bot');
  const totalSources = botMsgs.reduce((s, m) => s + (m.sourceCount || 0), 0);

  return (
    <div className="chat-window">
      <div className="chat-topbar">
        <div className="chat-topbar-info">
          <span className="chat-topbar-title">GrahamAI</span>
          <span className="chat-topbar-subtitle">
            Session · {msgCount} messages{totalSources > 0 ? ` · ${totalSources} source${totalSources !== 1 ? 's' : ''}` : ''}
          </span>
        </div>
        <div className="chat-topbar-actions">
          <button id="new-session-btn" className="topbar-btn primary" onClick={newSession}>
            ✦ New Session
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon"><img src={logo} alt="Graham" className="chat-logo-img" /></div>
            <div className="chat-empty-title">Ask anything about compliance</div>
            <div className="chat-empty-desc">
              Get expert guidance on GDPR, audits, data policies, regulatory requirements and more.
            </div>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="suggestion-chip"
                  onClick={() => handleSend(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ paddingTop: '16px', paddingBottom: '8px', width: '100%' }}>
            {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
          </div>
        )}

        {isLoading && (
          <div className="chat-typing">
            <div className="typing-avatar"><img src={logo} alt="Graham" className="chat-logo-img" /></div>
            <div className="typing-dots">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} style={{ height: '8px' }} />
      </div>

      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  );
}
