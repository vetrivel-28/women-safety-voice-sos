import React, { createContext, useState, useContext } from 'react';
import { EmergencyContact } from '../types';

interface ContactsContextType {
  contacts: EmergencyContact[];
  addContact: (contactData: Omit<EmergencyContact, 'id' | 'createdAt'>) => void;
  deleteContact: (contactId: string) => void;
  updateContact: (contactId: string, updates: Partial<EmergencyContact>) => void;
  getPrimaryContact: () => EmergencyContact | undefined;
  getTopFiveContacts: () => EmergencyContact[];
}

const ContactsContext = createContext<ContactsContextType | undefined>(undefined);

export const ContactsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);

  const addContact = (contactData: Omit<EmergencyContact, 'id' | 'createdAt'>) => {
    let priority = contactData.priority;
    if (typeof priority !== 'number' || isNaN(priority) || priority <= 0) {
      const maxPriority = contacts.length > 0 ? Math.max(...contacts.map(c => c.priority)) : 0;
      priority = maxPriority + 1;
    }

    const newContact: EmergencyContact = {
      ...contactData,
      priority,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };
    
    setContacts(prev => {
      const updated = [...prev, newContact];
      return updated.sort((a, b) => a.priority - b.priority);
    });
  };

  const deleteContact = (contactId: string) => {
    setContacts(prev => prev.filter(c => c.id !== contactId));
  };

  const updateContact = (contactId: string, updates: Partial<EmergencyContact>) => {
    setContacts(prev => {
      const updated = prev.map(c => c.id === contactId ? { ...c, ...updates } : c);
      return updated.sort((a, b) => a.priority - b.priority);
    });
  };

  const getPrimaryContact = () => {
    if (contacts.length === 0) return undefined;
    return contacts[0]; // Already sorted by priority ascending
  };

  const getTopFiveContacts = () => {
    return contacts.slice(0, 5); // Already sorted by priority ascending
  };

  return (
    <ContactsContext.Provider value={{ 
      contacts, 
      addContact, 
      deleteContact, 
      updateContact,
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
