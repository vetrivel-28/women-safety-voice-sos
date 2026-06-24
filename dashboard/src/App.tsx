import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import './index.css';

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  if (loading) {
    return <div className="loading-screen"><div className="spinner"></div></div>;
  }

  return (
    <div className="app-container">
      <Routes>
        <Route path="/login" element={!session ? <Login /> : <Navigate to="/overview" replace />} />
        <Route path="/overview" element={session ? <Dashboard session={session} /> : <Navigate to="/login" replace />} />
        <Route path="/" element={<Navigate to={session ? "/overview" : "/login"} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
