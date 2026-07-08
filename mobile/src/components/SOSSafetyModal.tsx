import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';

interface SOSSafetyModalProps {
  visible: boolean;
  onClose: () => void;
  safetySummary: any;
  loading: boolean;
}

export default function SOSSafetyModal({ visible, onClose, safetySummary, loading }: SOSSafetyModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Safety Summary</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#DC2626" />
              </View>
            ) : safetySummary ? (
              <>
                <Text style={styles.summaryText}>{safetySummary.summary}</Text>

                <View style={styles.statusSection}>
                  <Text style={styles.sectionTitle}>Current Status</Text>
                  <View style={styles.statusChips}>
                    {safetySummary.safe_window_active && (
                      <View style={[styles.chip, { backgroundColor: '#DBEAFE' }]}>
                        <Text style={[styles.chipText, { color: '#1E40AF' }]}>Safe Window Active</Text>
                      </View>
                    )}
                    {safetySummary.sos_active && (
                      <View style={[styles.chip, { backgroundColor: '#FEE2E2' }]}>
                        <Text style={[styles.chipText, { color: '#991B1B' }]}>SOS Active</Text>
                      </View>
                    )}
                    {safetySummary.missed_check_in && (
                      <View style={[styles.chip, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={[styles.chipText, { color: '#92400E' }]}>Missed Check-In</Text>
                      </View>
                    )}
                    {safetySummary.last_location?.has_location && (
                      <View style={[styles.chip, { backgroundColor: !safetySummary.last_location.is_stale ? '#D1FAE5' : '#F3F4F6' }]}>
                        <Text style={[styles.chipText, { color: !safetySummary.last_location.is_stale ? '#065F46' : '#6B7280' }]}>
                          {!safetySummary.last_location.is_stale ? 'Location Fresh' : 'Location Stale'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {safetySummary.notified_contacts && safetySummary.notified_contacts.length > 0 && (
                  <View style={styles.contactsSection}>
                    <Text style={styles.sectionTitle}>Notified Contacts</Text>
                    {safetySummary.notified_contacts.map((contact: any, index: number) => (
                      <View key={index} style={styles.contactItem}>
                        <Text style={styles.contactName}>{contact.name || contact.phone}</Text>
                        <Text style={styles.contactStatus}>{contact.status || 'Notified'}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.emptyText}>Unable to load safety summary.</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#64748B',
    lineHeight: 20,
  },
  modalBody: {
    padding: 20,
  },
  center: {
    padding: 40,
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 24,
    marginBottom: 20,
  },
  statusSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  statusChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  contactsSection: {
    marginTop: 24,
  },
  contactItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  contactName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1E293B',
  },
  contactStatus: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyText: {
    fontSize: 15,
    color: '#64748B',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
});
