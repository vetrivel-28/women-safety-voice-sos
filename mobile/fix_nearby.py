with open('src/components/NearbyRespondersList.tsx', 'w', encoding='utf-8') as f:
    f.write('''import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';

export const NearbyRespondersList = ({ responders, loading, sharingEnabled }: any) => {
  useEffect(() => {
    if (responders) {
      console.log([NearbyRespondersList] API member count: );
      console.log([NearbyRespondersList] transformed member count: );
      console.log([NearbyRespondersList] rendered member IDs:, responders.map((r: any) => r.user_id));
    }
  }, [responders]);

  if (!sharingEnabled) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Turn on location sharing to find nearby guardians.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Finding nearby responders...</Text>
      </View>
    );
  }

  if (!responders || responders.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No nearby responders available right now.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nearby Responders</Text>
      <BottomSheetFlatList
        data={responders}
        keyExtractor={(item: any) => item.user_id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        renderItem={({ item: r }: any) => (
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.name}>{r.name}</Text>
              <View style={[styles.statusDot, { backgroundColor: r.status === 'SAFE' ? '#22C35E' : '#F59E0B' }]} />
            </View>
            <Text style={styles.role}>{r.role === 'admin' ? 'Guardian' : 'Family Member'}</Text>
            <View style={styles.distanceRow}>
              <Text style={styles.distanceText}>{r.distance_km} km away</Text>
              {r.eta_minutes && <Text style={styles.etaText}> - {r.eta_minutes} min ETA</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748B',
    paddingHorizontal: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
    minWidth: 160,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  role: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  distanceText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4F46E5',
  },
  etaText: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyContainer: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    fontStyle: 'italic',
  }
});
''')
