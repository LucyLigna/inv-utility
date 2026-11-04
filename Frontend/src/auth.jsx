import { createContext, useContext, useEffect, useState } from 'react';
import api, { getToken, setToken } from './api';

// The logged-in user: { user_code, username, user_type, isAdmin, programs, routes } or null
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(getToken()));

  // A saved token from an earlier visit: check it is still valid
  useEffect(() => {
    if (!getToken()) return;
    api.get('/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const onLoggedOut = () => setUser(null);
    window.addEventListener('inv-logged-out', onLoggedOut);
    return () => window.removeEventListener('inv-logged-out', onLoggedOut);
  }, []);

  const signIn = ({ token, user: u }) => {
    setToken(token);
    setUser(u);
  };
  const signOut = () => {
    setToken(null);
    setUser(null);
  };
  // Screens the user may open (Home is always allowed)
  const canOpen = (route) => route === '/' || Boolean(user?.routes.includes(route));

  return (
    <AuthContext.Provider value={{ user, checking, signIn, signOut, canOpen }}>
      {children}
    </AuthContext.Provider>
  );
}
