import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useContacts } from '../context/ContactsContext';

export const ContactsScreen: React.FC = () => {
  const { contacts, addContact, deleteContact } = useContacts();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [priorityStr, setPriorityStr] = useState('');

  const handleAddContact = () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Name is required');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Validation Error', 'Phone number is required');
      return;
    }

    let priority = parseInt(priorityStr.trim(), 10);
    if (isNaN(priority)) {
      // Auto-assign next priority based on existing max
      const maxPriority = contacts.length > 0 ? Math.max(...contacts.map(c => c.priority)) : 0;
      priority = maxPriority + 1;
    }

    addContact({
      name: name.trim(),
      phone: phone.trim(),
      relationship: relationship.trim() || 'Friend',
      priority,
    });

    // Reset form
    setName('');
    setPhone('');
    setRelationship('');
    setPriorityStr('');
  };

  const sortedContacts = [...contacts].sort((a, b) => a.priority - b.priority).slice(0, 5);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Emergency Contacts</Text>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Add New Contact</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Name *"
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone number *"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <TextInput
              style={styles.input}
              placeholder="Relationship (e.g. Sister)"
              value={relationship}
              onChangeText={setRelationship}
            />
            <TextInput
              style={styles.input}
              placeholder="Priority (Optional number)"
              keyboardType="numeric"
              value={priorityStr}
              onChangeText={setPriorityStr}
            />

            <TouchableOpacity style={styles.addButton} onPress={handleAddContact}>
              <Text style={styles.addButtonText}>Add Contact</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.listSection}>
            <Text style={styles.sectionTitle}>Top 5 Emergency Contacts</Text>
            
            {sortedContacts.length === 0 ? (
              <Text style={styles.emptyText}>No contacts added yet.</Text>
            ) : (
              sortedContacts.map(contact => (
                <View key={contact.id} style={styles.contactCard}>
                  <View style={styles.contactHeader}>
                    <View style={styles.nameRow}>
                      <Text style={styles.contactName}>{contact.name}</Text>
                      {contact.priority === 1 && (
                        <View style={styles.primaryBadge}>
                          <Text style={styles.primaryBadgeText}>Primary Contact</Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => deleteContact(contact.id)}>
                      <Text style={styles.deleteText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <Text style={styles.contactDetail}>Phone: {contact.phone}</Text>
                  <Text style={styles.contactDetail}>Relationship: {contact.relationship}</Text>
                  <Text style={styles.contactDetail}>Priority: {contact.priority}</Text>
                </View>
              ))
            )}
          </View>
          
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF7F7' },
  container: { flexGrow: 1, padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111827', marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  formCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#F9FAFB'
  },
  addButton: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center'
  },
  addButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  listSection: { marginTop: 8 },
  emptyText: { color: '#6B7280', fontStyle: 'italic', marginTop: 8 },
  contactCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
  },
  contactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  contactName: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  primaryBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  primaryBadgeText: { color: '#F59E0B', fontSize: 10, fontWeight: 'bold' },
  deleteText: { color: '#DC2626', fontWeight: 'bold', fontSize: 14 },
  contactDetail: { color: '#4B5563', fontSize: 14, marginBottom: 4 }
});
