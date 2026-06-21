import React, { createContext, useState, useContext } from 'react';
import { EmergencyContact } from '../types';

interface ContactsContextType {
  contacts: EmergencyContact[];
  addContact: (contactData: Omit<EmergencyContact, 'id'>) => void;
  deleteContact: (contactId: string) => void;
  updateContact: (contactId: string, updates: Partial<EmergencyContact>) => void;
}

const ContactsContext = createContext<ContactsContextType | undefined>(undefined);

export const ContactsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);

  const addContact = (contactData: Omit<EmergencyContact, 'id'>) => {
    const newContact: EmergencyContact = {
      ...contactData,
      id: Date.now().toString(),
    };
    setContacts(prev => [...prev, newContact]);
  };

  const deleteContact = (contactId: string) => {
    setContacts(prev => prev.filter(c => c.id !== contactId));
  };

  const updateContact = (contactId: string, updates: Partial<EmergencyContact>) => {
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, ...updates } : c));
  };

  return (
    <ContactsContext.Provider value={{ contacts, addContact, deleteContact, updateContact }}>
      {children}
    </ContactsContext.Provider>
  );
};

export const useContacts = () => {
  const context = useContext(ContactsContext);
  if (!context) throw new Error('useContacts must be used within a ContactsProvider');
  return context;
};
