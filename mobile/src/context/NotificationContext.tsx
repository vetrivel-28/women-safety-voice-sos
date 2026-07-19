import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { apiClient } from '../api/client';
import { InAppNotificationBanner } from '../components/InAppNotificationBanner';

export interface AppNotification {
  id: string;
  created_at: string;
  read_at: string | null;
  type: string;
  title: string;
  message: string;
  metadata: any;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeBanner, setActiveBanner] = useState<AppNotification | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const fetchNotifications = async (force = false) => {
    try {
      // First check if logged in
      const { data: { session } } = await import('../lib/supabaseClient').then(m => m.supabase.auth.getSession());
      if (!session) return; // Stop polling if not logged in

      const res = await apiClient.get('/api/notifications');
      const data = res.data || [];
      setNotifications(data);

      const unreadRes = await apiClient.get('/api/notifications/unread-count');
      const count = unreadRes.data?.count || 0;
      setUnreadCount(count);

      // Show banner for new unread notifications
      const newUnread = data.filter((n: AppNotification) => !n.read_at);
      if (newUnread.length > 0) {
        const latest = newUnread[0];
        if (!seenIds.current.has(latest.id)) {
          seenIds.current.add(latest.id);
          setActiveBanner(latest);
          setTimeout(() => setActiveBanner(null), 4000);
        }
      }
    } catch (e: any) {
      const httpStatus = e.response?.status;
      const isPermissionError = e.response?.data?.error === 'notifications_unavailable';

      if (isPermissionError || httpStatus === 503) {
        // Log once — don't spam. The backend already logged the DB permission error.
        console.warn('[Notifications] Notifications temporarily unavailable (backend 503 or permissions issue).');
        return;
      }
      // Avoid spamming logs for expected transient failures
      if (httpStatus !== 500 && httpStatus !== 401) {
        console.warn('[Notifications] Failed to fetch notifications:', e.message || e);
      }
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await apiClient.post(`/api/notifications/${id}/read`);
      await fetchNotifications();
    } catch (e) {
      console.warn('Failed to mark read', e);
    }
  };

  const markAllAsRead = async () => {
    try {
      await apiClient.post('/api/notifications/read-all');
      await fetchNotifications();
    } catch (e) {
      console.warn('Failed to mark all read', e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    
    let channel: any;
    
    const setupRealtime = async () => {
      const { data: { session } } = await import('../lib/supabaseClient').then(m => m.supabase.auth.getSession());
      if (session?.user?.id) {
        const { supabase } = await import('../lib/supabaseClient');
        channel = supabase.channel('app_notifications_channel')
          .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'app_notifications', 
            filter: `user_id=eq.${session.user.id}` 
          }, () => {
            fetchNotifications();
          })
          .subscribe();
      }
    };
    
    setupRealtime();

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        fetchNotifications();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      if (channel) {
        import('../lib/supabaseClient').then(m => m.supabase.removeChannel(channel));
      }
      subscription.remove();
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, fetchNotifications, markAsRead, markAllAsRead }}>
      {children}
      {activeBanner && (
        <InAppNotificationBanner 
          title={activeBanner.title} 
          message={activeBanner.message} 
          onClose={() => setActiveBanner(null)} 
        />
      )}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
};
