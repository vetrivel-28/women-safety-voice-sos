import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFamily } from '../context/FamilyContext';
import { apiClient } from '../api/client';

export default function NearbyRespondersScreen() {
  const { family } = useFamily();
  const [nearbyResponders, setNearbyResponders] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (family) {
      fetchNearbyResponders();
    }
  }, [family?.id]);

  const fetchNearbyResponders = async (isRefresh = false) => {
    if (!family) return;

    // Cancel previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const abortController = new AbortController();
    abortRef.current = abortController;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await apiClient.get(`/api/family/${family.id}/nearby-responders`);
      console.log('[NEARBY RESPONDERS RESPONSE] =', JSON.stringify(res.data));
      setNearbyResponders(res.data);
    } catch (e: any) {
      if (e.name !== 'CanceledError') {
        console.warn('[NEARBY RESPONDERS ERROR]', e);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchNearbyResponders(true);
  };

  if (!family) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>No family selected.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderResponder = ({ item }: { item: any }) => (
    <View style={styles.responderCard}>
      <View style={styles.responderHeader}>
        <View>
          <Text style={styles.responderName}>{item.name}</Text>
          <Text style={styles.responderRole}>{item.role}</Text>
        </View>
        <View style={styles.responderRight}>
          <Text style={styles.responderDistance}>{item.distance_km} km</Text>
          <View style={[styles.statusBadge, { backgroundColor: item.status === 'ONLINE' ? '#D1FAE5' : '#F3F4F6' }]}>
            <Text style={[styles.statusText, { color: item.status === 'ONLINE' ? '#065F46' : '#6B7280' }]}>
              {item.status}
            </Text>
          </View>
        </View>
      </View>
      {item.last_seen && (
        <Text style={styles.lastSeen}>Last seen: {new Date(item.last_seen).toLocaleString()}</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Nearby Responders</Text>
        <Text style={styles.subtitle}>{family.family_name}</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : nearbyResponders ? (
        <>
          {!nearbyResponders.origin_available ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>Share your location to see nearby responders.</Text>
            </View>
          ) : nearbyResponders.responders.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>No nearby responders with shared location right now.</Text>
            </View>
          ) : (
            <FlatList
              data={nearbyResponders.responders}
              keyExtractor={(item) => item.user_id}
              renderItem={renderResponder}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#4F46E5']} />
              }
            />
          )}
        </>
      ) : (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Unable to load nearby responders.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAF9',
  },
  header: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 15,
    color: '#64748B',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  responderCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  responderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  responderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  responderRole: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  responderRight: {
    alignItems: 'flex-end',
  },
  responderDistance: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4F46E5',
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  lastSeen: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 8,
  },
});
