import React, { createContext, useState, useContext, useEffect } from 'react';
import { EmergencyContact } from '../types';
import { supabase } from '../lib/supabaseClient';

interface ContactsContextType {
  contacts: EmergencyContact[];
  addContact: (contactData: Omit<EmergencyContact, 'id' | 'createdAt'>) => void;
  deleteContact: (contactId: string) => void;
  updateContact: (contactId: string, updates: Partial<EmergencyContact>) => void;
  setPrimaryContact: (contactId: string) => void;
  getPrimaryContact: () => EmergencyContact | undefined;
  getTopFiveContacts: () => EmergencyContact[];
}

const ContactsContext = createContext<ContactsContextType | undefined>(undefined);

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8000';

export const ContactsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchContacts(session.access_token);
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchContacts(session.access_token);
      } else {
        setContacts([]);
      }
    });
  }, []);

  const fetchContacts = async (token: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/guardians`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        // Backend returns guardian records, map them to EmergencyContact format
        const mappedContacts: EmergencyContact[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          phone: item.phone,
          email: item.email || undefined,
          relationship: item.relationship || 'Emergency Contact',
          priority: item.priority || 1,
          createdAt: item.created_at
        }));
        setContacts(mappedContacts.sort((a, b) => a.priority - b.priority));
      }
    } catch (e) {
      console.warn('Could not fetch contacts', e);
    }
  };

  const addContact = async (contactData: Omit<EmergencyContact, 'id' | 'createdAt'>) => {
    let priority = contactData.priority;
    if (typeof priority !== 'number' || isNaN(priority) || priority <= 0) {
      const maxPriority = contacts.length > 0 ? Math.max(...contacts.map(c => c.priority)) : 0;
      priority = maxPriority + 1;
    }

    if (session) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/guardians`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: contactData.name,
            phone: contactData.phone,
            email: contactData.email || null,
            relationship: contactData.relationship,
            priority: priority
          })
        });
        if (response.ok) {
          const item = await response.json();
          const newContact: EmergencyContact = {
            id: item.id,
            name: item.name,
            phone: item.phone,
            email: item.email || undefined,
            relationship: item.relationship || 'Emergency Contact',
            priority: item.priority || 1,
            createdAt: item.created_at,
          };
          setContacts(prev => [...prev, newContact].sort((a, b) => a.priority - b.priority));
        }
      } catch (e) {
        console.warn('Could not add contact', e);
      }
    } else {
      // Local fallback
      const newContact: EmergencyContact = {
        ...contactData,
        priority,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
      };
      setContacts(prev => [...prev, newContact].sort((a, b) => a.priority - b.priority));
    }
  };

  const deleteContact = async (contactId: string) => {
    if (session) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/guardians/${contactId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (response.ok) {
          setContacts(prev => prev.filter(c => c.id !== contactId));
        }
      } catch (e) {
        console.warn('Could not delete contact', e);
      }
    } else {
      setContacts(prev => prev.filter(c => c.id !== contactId));
    }
  };

  const updateContact = (contactId: string, updates: Partial<EmergencyContact>) => {
    // Ideally this would also call a PUT/PATCH API, but avoiding scope creep.
    setContacts(prev => {
      const updated = prev.map(c => c.id === contactId ? { ...c, ...updates } : c);
      return updated.sort((a, b) => a.priority - b.priority);
    });
  };

  const setPrimaryContact = (contactId: string) => {
    setContacts(prev => {
      const updated = prev.map(c => {
        if (c.id === contactId) return { ...c, priority: 1 };
        if (c.priority === 1) return { ...c, priority: 2 };
        return c;
      });
      return updated.sort((a, b) => a.priority - b.priority);
    });
  };

  const getPrimaryContact = () => {
    if (contacts.length === 0) return undefined;
    return contacts[0];
  };

  const getTopFiveContacts = () => {
    return contacts.slice(0, 5);
  };

  return (
    <ContactsContext.Provider value={{ 
      contacts, 
      addContact, 
      deleteContact, 
      updateContact,
      setPrimaryContact,
      getPrimaryContact,
      getTopFiveContacts
    }}>
      {children}
    </ContactsContext.Provider>
  );
};

export const useContacts = () => {
  const context = useContext(ContactsContext);
  if (!context) {
    throw new Error('useContacts must be used within a ContactsProvider');
  }
  return context;
};
