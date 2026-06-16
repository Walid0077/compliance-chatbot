import { useState } from 'react';
import { apiGet } from '../api/client';
import logo from '../logo.jpeg';
import './LoginGate.css';

export default function LoginGate({ onLogin }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiGet('/api/verify', value);
      onLogin(value);
    } catch {
      setError('Incorrect password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-card">
      <div className="login-logo">
        <img src={logo} alt="Graham logo" className="login-logo-img" />
      </div>
      <div className="login-header">
        <h1 className="login-title">GrahamAI</h1>
        <p className="login-subtitle">
          Your AI-powered compliance assistant.<br />
          Enter your access password to continue.
        </p>
      </div>

      <form className="login-form" onSubmit={handleSubmit}>
        <div className="login-input-wrap">
          <label className="login-label" htmlFor="login-password">Access Password</label>
          <input
            id="login-password"
            type="password"
            className="login-input"
            placeholder="Enter password…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button
          id="login-submit-btn"
          type="submit"
          className="login-submit"
          disabled={loading || !value}
        >
          {loading ? (
            <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Verifying…</>
          ) : (
            <><span>→</span> Enter Workspace</>
          )}
        </button>
      </form>

      <p className="login-footer">
        Protected workspace · GrahamAI v2.0
      </p>
    </div>
  );
}
