import { useState } from 'react';
import Auth from './components/Auth';
import Chat from './components/Chat';
import './App.css';

function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('chatapp_user');
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      return typeof parsed === 'object' && parsed?.username
        ? parsed
        : { username: stored, firstName: '', lastName: '' };
    } catch {
      const u = localStorage.getItem('chatapp_user');
      return u ? { username: u, firstName: '', lastName: '' } : null;
    }
  });

  const handleLogin = (userData) => {
    const u = typeof userData === 'object' && userData?.username
      ? userData
      : { username: userData, firstName: '', lastName: '' };
    localStorage.setItem('chatapp_user', JSON.stringify(u));
    setUser(u);
  };

  const handleLogout = () => {
    localStorage.removeItem('chatapp_user');
    setUser(null);
  };

  if (user) {
    return <Chat user={user} onLogout={handleLogout} />;
  }
  return <Auth onLogin={handleLogin} />;
}

export default App;
