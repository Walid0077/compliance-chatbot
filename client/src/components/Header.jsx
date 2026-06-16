import './Header.css';

export default function Header({ onLogout }) {
  return (
    <header className="header">
      <h1 className="header-title">GrahamAI</h1>
      <button className="header-logout" onClick={onLogout}>
        Logout
      </button>
    </header>
  );
}
