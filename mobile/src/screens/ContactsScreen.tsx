import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useContacts } from '../context/ContactsContext';

export const ContactsScreen: React.FC = () => {
  const { getTopFiveContacts, addContact, deleteContact } = useContacts();

  console.log("CONTACTS_SCREEN_VERSION_1");

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [priorityStr, setPriorityStr] = useState('');

  const topFive = getTopFiveContacts();

  const handleAddContact = () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Name is required.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Validation Error', 'Phone number is required.');
      return;
    }

    let priority: number | undefined;
    if (priorityStr.trim() !== '') {
      priority = parseInt(priorityStr.trim(), 10);
      if (isNaN(priority)) {
        Alert.alert('Validation Error', 'Priority must be a number if provided.');
        return;
      }
    }

    addContact({
      name: name.trim(),
      phone: phone.trim(),
      relationship: relationship.trim() || 'Friend',
      priority: priority as number, // Context handles undefined/NaN by auto-assigning
    });

    setName('');
    setPhone('');
    setRelationship('');
    setPriorityStr('');
  };

  const handleClearForm = () => {
    setName('');
    setPhone('');
    setRelationship('');
    setPriorityStr('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Emergency Contacts</Text>
          <Text style={styles.subtitle}>Add trusted people who should receive alerts.</Text>

          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>Contact Name *</Text>
            <TextInput
              style={[styles.input, { color: '#111827' }]}
              placeholder="Name *"
              placeholderTextColor="#6B7280"
              value={name}
              onChangeText={setName}
            />
            <Text style={styles.inputLabel}>Phone Number *</Text>
            <TextInput
              style={[styles.input, { color: '#111827' }]}
              placeholder="Phone number *"
              placeholderTextColor="#6B7280"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <Text style={styles.inputLabel}>Relationship</Text>
            <TextInput
              style={[styles.input, { color: '#111827' }]}
              placeholder="Relationship"
              placeholderTextColor="#6B7280"
              value={relationship}
              onChangeText={setRelationship}
            />
            <Text style={styles.inputLabel}>Priority</Text>
            <TextInput
              style={[styles.input, { color: '#111827' }]}
              placeholder="Priority"
              placeholderTextColor="#6B7280"
              keyboardType="numeric"
              value={priorityStr}
              onChangeText={setPriorityStr}
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.addButton} onPress={handleAddContact}>
                <Text style={styles.addButtonText}>Add Contact</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.clearButton} onPress={handleClearForm}>
                <Text style={styles.clearButtonText}>Clear form</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.listSection}>
            <Text style={styles.sectionTitle}>Top 5 Emergency Contacts</Text>
            
            {topFive.length === 0 ? (
              <Text style={styles.emptyText}>No emergency contacts added yet.</Text>
            ) : (
              topFive.map(contact => (
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
  title: { fontSize: 28, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#6B7280', marginBottom: 24 },
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
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginLeft: 4,
  },
  buttonRow: { flexDirection: 'row', gap: 12 },
  addButton: {
    flex: 2,
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center'
  },
  addButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  clearButton: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center'
  },
  clearButtonText: { color: '#374151', fontWeight: 'bold', fontSize: 16 },
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
