import { NavLink } from 'react-router-dom';
import logo from '../logo.jpeg';
import './Sidebar.css';

const navItems = [
  { to: '/',          icon: '💬', label: 'Chat',      desc: 'Ask questions' },
  { to: '/history',   icon: '🕐', label: 'History',   desc: 'Past sessions' },
  { to: '/dashboard', icon: '📊', label: 'Dashboard', desc: 'Analytics' },
];

export default function Sidebar({ onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src={logo} alt="Graham logo" className="sidebar-logo-img" />
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-title">GrahamAI</span>
          <span className="sidebar-logo-subtitle">Powered by Dialogflow CX</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <span className="sidebar-nav-label">Main Menu</span>
        {navItems.map(({ to, icon, label, desc }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{icon}</span>
            <span className="nav-text">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-status">
          <span className="status-dot" />
          <span className="status-text">Agent Connected</span>
        </div>
        <button id="logout-btn" className="sidebar-logout" onClick={onLogout}>
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
