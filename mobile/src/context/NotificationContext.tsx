import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { apiClient } from '../api/client';
import { InAppNotificationBanner } from '../components/InAppNotificationBanner';

export interface AppNotification {
  id: string;
  created_at: string;
  status: string;
  message: string;
  recipient: string;
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

  const fetchNotifications = async () => {
    try {
      const res = await apiClient.get('/api/notifications');
      const data = res.data || [];
      setNotifications(data);

      const unreadRes = await apiClient.get('/api/notifications/unread-count');
      const count = unreadRes.data?.count || 0;
      setUnreadCount(count);

      // Show banner for new unread notifications
      const newUnread = data.filter((n: AppNotification) => n.status === 'UNREAD');
      if (newUnread.length > 0) {
        const latest = newUnread[0];
        if (!seenIds.current.has(latest.id)) {
          seenIds.current.add(latest.id);
          setActiveBanner(latest);
          setTimeout(() => setActiveBanner(null), 4000);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch notifications', e);
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
    const interval = setInterval(fetchNotifications, 15000); // Poll every 15s

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        fetchNotifications();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, fetchNotifications, markAsRead, markAllAsRead }}>
      {children}
      {activeBanner && (
        <InAppNotificationBanner 
          title={activeBanner.recipient} 
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
