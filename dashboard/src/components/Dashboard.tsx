import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { AlertCircle, ShieldCheck, Clock, MapPin, LogOut } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function Dashboard({ session }: { session: any }) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    fetchAlerts();
    
    // Poll every 10 seconds
    const interval = setInterval(() => {
      fetchAlerts(false);
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchAlerts = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/alerts`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch live alerts from backend');
      const data = await response.json();
      setAlerts(data);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleLogout = () => {
    supabase.auth.signOut();
  };

  const activeAlerts = alerts.filter(a => a.status === 'ACTIVE' || a.status === 'SILENT_DURESS_ACTIVE');
  const resolvedAlerts = alerts.filter(a => a.status === 'RESOLVED' || a.status === 'CANCELLED');

  return (
    <div className="dashboard-layout">
      <header className="dashboard-header">
        <div className="header-brand">
          <ShieldCheck size={28} className="brand-icon" />
          <h2>SafeHer Live Dashboard</h2>
        </div>
        <div className="header-actions">
          <span className="user-email">{session.user.email}</span>
          <button onClick={handleLogout} className="outline-btn"><LogOut size={16} /> Logout</button>
        </div>
      </header>

      <main className="dashboard-main">
        {error && <div className="error-banner">{error}</div>}
        
        <div className="summary-cards">
          <div className="card stat-card danger">
            <div className="stat-icon"><AlertCircle size={24} /></div>
            <div className="stat-content">
              <h3>Active Alerts</h3>
              <p className="stat-value">{activeAlerts.length}</p>
            </div>
          </div>
          <div className="card stat-card safe">
            <div className="stat-icon"><ShieldCheck size={24} /></div>
            <div className="stat-content">
              <h3>Resolved</h3>
              <p className="stat-value">{resolvedAlerts.length}</p>
            </div>
          </div>
          <div className="card stat-card total">
            <div className="stat-icon"><Clock size={24} /></div>
            <div className="stat-content">
              <h3>Total Events</h3>
              <p className="stat-value">{alerts.length}</p>
            </div>
          </div>
        </div>

        <div className="alerts-section">
          <div className="alerts-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Live Alert Stream</h3>
            <div className="alerts-controls" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {lastUpdated && <span style={{ fontSize: '12px', color: '#64748b' }}>Last updated: {lastUpdated.toLocaleTimeString()}</span>}
              <button onClick={() => fetchAlerts(true)} className="outline-btn" style={{ padding: '4px 12px', fontSize: '12px' }}>
                Refresh
              </button>
            </div>
          </div>
          {loading ? (
             <div className="loading-spinner">Loading real-time data...</div>
          ) : alerts.length === 0 ? (
             <div className="empty-state">No alerts recorded yet.</div>
          ) : (
            <div className="alerts-grid">
              {alerts.map(alert => (
                <div key={alert.id} className={`alert-card ${alert.status.toLowerCase()}`}>
                  <div className="alert-header">
                    <span className="alert-type">{alert.trigger_type.replace(/_/g, ' ')}</span>
                    <span className={`status-badge ${alert.status.toLowerCase()}`}>{alert.status}</span>
                  </div>
                  <div className="alert-body">
                    {alert.visible_message && <p className="alert-msg">"{alert.visible_message}"</p>}
                    <p className="alert-time">
                      <Clock size={14} /> {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                    </p>
                    {(alert.latitude && alert.longitude) && (
                      <p className="alert-location">
                        <MapPin size={14} /> {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}
                        {alert.map_link && <a href={alert.map_link} target="_blank" rel="noreferrer" className="map-link">View Map</a>}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
