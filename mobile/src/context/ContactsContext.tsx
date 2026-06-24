import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EmergencyContact } from '../types';
import { supabase } from '../lib/supabaseClient';

import { API_BASE_URL } from '../api/client';
const STORAGE_KEY = '@safeher_contacts';

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

export const ContactsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    const loadCachedContacts = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setContacts(JSON.parse(stored));
        }
      } catch (e) {
        console.error('Failed to load contacts from storage', e);
      }
    };
    loadCachedContacts();

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
      }
    });
  }, []);

  const persistContacts = async (newContacts: EmergencyContact[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newContacts));
    } catch (e) {
      console.error('Failed to save contacts to storage', e);
    }
  };

  const fetchContacts = async (token: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/contacts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const mappedContacts: EmergencyContact[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          phone: item.phone,
          relationship: item.relationship || 'Emergency Contact',
          priority: item.priority || 1,
          createdAt: item.created_at
        }));
        const updated = mappedContacts.sort((a, b) => a.priority - b.priority);
        setContacts(updated);
        persistContacts(updated);
      } else {
        console.error('Failed to fetch contacts from backend');
      }
    } catch (e) {
      console.error('Could not fetch contacts', e);
    }
  };

  const addContact = async (contactData: Omit<EmergencyContact, 'id' | 'createdAt'>) => {
    let priority = contactData.priority;
    if (typeof priority !== 'number' || isNaN(priority) || priority <= 0) {
      const maxPriority = contacts.length > 0 ? Math.max(...contacts.map(c => c.priority)) : 0;
      priority = maxPriority + 1;
    }

    if (!session) {
      console.error("No active session, cannot add contact");
      return;
    }

    try {
      const payload = {
        name: contactData.name,
        phone: contactData.phone,
        relationship: contactData.relationship,
        priority: priority
      };
      const response = await fetch(`${API_BASE_URL}/api/contacts`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        const item = await response.json();
        const newContact: EmergencyContact = {
          id: item.id,
          name: item.name,
          phone: item.phone,
          relationship: item.relationship || 'Emergency Contact',
          priority: item.priority || 1,
          createdAt: item.created_at,
        };
        setContacts(prev => {
          const updated = [...prev, newContact].sort((a, b) => a.priority - b.priority);
          persistContacts(updated);
          return updated;
        });
      } else {
        console.error('Backend failed to add contact');
      }
    } catch (e) {
      console.error('Network error adding contact', e);
    }
  };

  const deleteContact = async (contactId: string) => {
    if (!session) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/contacts/${contactId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (response.ok) {
        setContacts(prev => {
          const updated = prev.filter(c => c.id !== contactId);
          persistContacts(updated);
          return updated;
        });
      } else {
        console.error("Backend failed to delete contact");
      }
    } catch (e) {
      console.error('Network error deleting contact', e);
    }
  };

  const updateContact = async (contactId: string, updates: Partial<EmergencyContact>) => {
    if (!session) return;
    try {
      const payload: any = { ...updates };
      delete payload.id;
      delete payload.createdAt;
      delete payload.email; // explicitly remove email
      
      const response = await fetch(`${API_BASE_URL}/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        const item = await response.json();
        setContacts(prev => {
          const updated = prev.map(c => c.id === contactId ? { ...c, ...item } : c).sort((a, b) => a.priority - b.priority);
          persistContacts(updated);
          return updated;
        });
      } else {
        console.error("Backend failed to update contact");
      }
    } catch (e) {
      console.error('Network error updating contact', e);
    }
  };

  const setPrimaryContact = (contactId: string) => {
    // Requires updating multiple contacts to shift priorities. 
    // In a real app we'd do a bulk update or just update the new primary.
    // Simplifying by calling updateContact on the one to be primary.
    updateContact(contactId, { priority: 1 });
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

