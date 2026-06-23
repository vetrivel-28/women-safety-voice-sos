import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, Linking, Platform } from 'react-native';
import { useAlert } from '../context/AlertContext';
import { AlertCard } from '../components/AlertCard';
import { SectionHeader } from '../components/SectionHeader';

export const AlertHistoryScreen: React.FC = () => {
  const { alerts, clearAlerts, retryPendingAlerts } = useAlert();

  const handleClearAlerts = () => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear all alerts? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: clearAlerts }
      ]
    );
  };

  const handleViewMap = (link: string) => {
    Linking.openURL(link);
  };

  const handleRetrySync = async () => {
    try {
      await retryPendingAlerts();
    } catch (e) {
      console.log('Retry failed', e);
    }
  };

  const activeCount = alerts.filter(a => a.status === 'ACTIVE' || a.status === 'SILENT_DURESS_ACTIVE').length;
  const resolvedCount = alerts.filter(a => a.status === 'RESOLVED' || a.status === 'CANCELLED').length;
  const totalCount = alerts.length;
  const pendingCount = alerts.filter(a => a.syncStatus === 'PENDING_SYNC' || a.syncStatus === 'FAILED_SYNC').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        
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

        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalCount}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, activeCount > 0 && { color: '#DC2626' }]}>{activeCount}</Text>
            <Text style={styles.summaryLabel}>Active</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{resolvedCount}</Text>
            <Text style={styles.summaryLabel}>Resolved</Text>
          </View>
        </View>

        {pendingCount > 0 && (
          <TouchableOpacity onPress={handleRetrySync} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry {pendingCount} Pending Sync{pendingCount > 1 ? 's' : ''}</Text>
          </TouchableOpacity>
        )}

        <SectionHeader title="Recent Alerts" />
        
        {alerts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No Alerts Recorded</Text>
            <Text style={styles.emptyText}>Your safety history will appear here.</Text>
          </View>
        ) : (
          alerts.map((alert) => (
            <AlertCard 
              key={alert.id} 
              alert={alert} 
              onViewMap={handleViewMap}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { 
    flex: 1, 
    backgroundColor: '#FAFAF9' 
  },
  container: { 
    flexGrow: 1, 
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 20 : 60,
  },
  headerRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 24 
  },
  title: { 
    fontSize: 32, 
    fontWeight: '900', 
    color: '#1E293B',
    letterSpacing: -0.5,
  },
  clearButton: { 
    padding: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  clearButtonText: { 
    color: '#DC2626', 
    fontWeight: '700',
    fontSize: 13,
  },
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#F1F5F9',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1E293B',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  retryButtonText: {
    color: '#D97706',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    minHeight: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  emptyText: { 
    fontSize: 14, 
    color: '#64748B', 
    textAlign: 'center',
    lineHeight: 20,
  },
});
