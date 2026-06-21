import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native';
import { useAlert } from '../context/AlertContext';
import { AlertStatus } from '../types';

export const AlertHistoryScreen: React.FC = () => {
  const { alerts, clearAlerts } = useAlert();

  const getStatusColor = (status: AlertStatus) => {
    switch (status) {
      case 'ACTIVE': return '#DC2626'; // red
      case 'CANCELLED': return '#6B7280'; // gray (or gray/green as requested)
      case 'SILENT_DURESS_ACTIVE': return '#7F1D1D'; // dark red
      case 'RESOLVED': return '#16A34A'; // green
      default: return '#6B7280';
    }
  };

  const getStatusText = (status: AlertStatus) => {
    switch (status) {
      case 'ACTIVE': return 'ACTIVE';
      case 'CANCELLED': return 'CANCELLED';
      case 'SILENT_DURESS_ACTIVE': return 'SILENT_DURESS_ACTIVE';
      case 'RESOLVED': return 'RESOLVED';
      default: return status;
    }
  };

  const handleClearAlerts = () => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear all alerts?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: clearAlerts }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Alert History</Text>
          {alerts.length > 0 && clearAlerts && (
            <TouchableOpacity 
              onPress={handleClearAlerts} 
              style={styles.clearButton}
            >
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {alerts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No alerts yet.</Text>
          </View>
        ) : (
          alerts.map((alert) => (
            <View key={alert.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.triggerType}>
                  {alert.triggerType === 'MANUAL_SOS' ? 'Manual SOS' : 'Silent SOS'}
                </Text>
                <View style={[styles.badge, { backgroundColor: getStatusColor(alert.status) }]}>
                  <Text style={styles.badgeText}>{getStatusText(alert.status)}</Text>
                </View>
              </View>
              <Text style={styles.messageText}>{alert.visibleMessage}</Text>
              <Text style={styles.dateText}>
                Created: {new Date(alert.createdAt).toLocaleString()}
              </Text>
              {alert.cancelMethod && (
                <Text style={styles.methodText}>
                  Cancel Method: {alert.cancelMethod}
                </Text>
              )}
              {alert.location && !alert.location.permissionDenied ? (
                <View style={styles.locationContainer}>
                  <Text style={styles.locationText}>
                    {alert.location.latitude.toFixed(4)}, {alert.location.longitude.toFixed(4)}
                  </Text>
                  <TouchableOpacity onPress={() => Linking.openURL(alert.location!.mapLink)}>
                    <Text style={styles.mapLinkText}>View on Map</Text>
                  </TouchableOpacity>
                </View>
              ) : alert.status === 'ACTIVE' ? (
                <Text style={styles.locationUnavailableText}>Location not available</Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF7F7' },
  container: { flexGrow: 1, padding: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111827' },
  clearButton: { padding: 8 },
  clearButtonText: { color: '#DC2626', fontWeight: 'bold' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
  emptyText: { fontSize: 16, color: '#6B7280', fontStyle: 'italic' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  triggerType: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  messageText: { fontSize: 14, color: '#111827', marginBottom: 8 },
  dateText: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  methodText: { fontSize: 12, color: '#4B5563', fontWeight: '500' },
  locationContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  locationText: { fontSize: 12, color: '#6B7280' },
  mapLinkText: { fontSize: 12, color: '#3B82F6', fontWeight: 'bold' },
  locationUnavailableText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' }
});
