import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentLocationForAlert } from '../utils/location';
import { trustedPlacesApi, CreateTrustedPlacePayload } from '../api/trustedPlaces';
import {
  TrustedPlace, TrustedPlaceLabel,
  TRUSTED_PLACE_LABELS, TRUSTED_PLACE_LABEL_ICONS,
} from '../types';
import { PrimaryButton } from '../components/PrimaryButton';

// ── Inline add/edit modal ────────────────────────────────────────────────────
interface PlaceFormProps {
  visible: boolean;
  initial?: TrustedPlace | null;
  onClose: () => void;
  onSave: (payload: CreateTrustedPlacePayload, id?: string) => Promise<void>;
}

function PlaceFormModal({ visible, initial, onClose, onSave }: PlaceFormProps) {
  const [name, setName] = useState('');
  const [label, setLabel] = useState<TrustedPlaceLabel | null>(null);
  const [radius, setRadius] = useState('100');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [notify, setNotify] = useState(true);
  const [loading, setLoading] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(initial?.name || '');
      setLabel(initial?.label || null);
      setRadius(String(initial?.radius_meters || 100));
      setAddress(initial?.address || '');
      setLat(initial ? String(initial.latitude) : '');
      setLon(initial ? String(initial.longitude) : '');
      setNotify(initial?.notify_guardians_on_arrival ?? true);
      setError(null);
    }
  }, [visible, initial]);

  const useCurrentLocation = async () => {
    setLocLoading(true);
    try {
      const loc = await getCurrentLocationForAlert();
      if (loc && !loc.permissionDenied) {
        setLat(String(loc.latitude));
        setLon(String(loc.longitude));
        if (!address) setAddress('Current Location');
      } else {
        setError('Location permission denied.');
      }
    } catch (e) {
      setError('Could not get location.');
    } finally {
      setLocLoading(false);
    }
  };

  const handleSave = async () => {
    const latF = parseFloat(lat);
    const lonF = parseFloat(lon);
    const radI = parseInt(radius, 10);
    if (!name.trim()) { setError('Name is required.'); return; }
    if (isNaN(latF) || isNaN(lonF)) { setError('Valid latitude and longitude are required.'); return; }
    if (isNaN(radI) || radI < 50 || radI > 1000) { setError('Radius must be between 50 and 1000 metres.'); return; }

    setLoading(true);
    setError(null);
    try {
      await onSave(
        { name: name.trim(), label, latitude: latF, longitude: lonF, address: address.trim() || null, radius_meters: radI, notify_guardians_on_arrival: notify },
        initial?.id,
      );
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || 'Failed to save.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={mStyles.modal}>
        <View style={mStyles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={mStyles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={mStyles.title}>{initial ? 'Edit Place' : 'Add Trusted Place'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={loading}>
            <Text style={[mStyles.save, loading && { opacity: 0.4 }]}>{loading ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={mStyles.body} keyboardShouldPersistTaps="handled">
          {error && <View style={mStyles.errorBox}><Text style={mStyles.errorTxt}>{error}</Text></View>}

          <Text style={mStyles.label}>Name *</Text>
          <TextInput style={mStyles.input} placeholder="e.g. Home, My Office…" value={name} onChangeText={setName} />

          <Text style={mStyles.label}>Category</Text>
          <View style={mStyles.chipRow}>
            {TRUSTED_PLACE_LABELS.map(l => (
              <TouchableOpacity
                key={l}
                style={[mStyles.chip, label === l && mStyles.chipSelected]}
                onPress={() => setLabel(prev => prev === l ? null : l)}
              >
                <Text style={label === l ? mStyles.chipTxtSelected : mStyles.chipTxt}>
                  {TRUSTED_PLACE_LABEL_ICONS[l]} {l}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={mStyles.label}>Location *</Text>
          <View style={mStyles.row}>
            <TextInput style={[mStyles.input, { flex: 1, marginRight: 8 }]} placeholder="Latitude" keyboardType="decimal-pad" value={lat} onChangeText={setLat} />
            <TextInput style={[mStyles.input, { flex: 1 }]} placeholder="Longitude" keyboardType="decimal-pad" value={lon} onChangeText={setLon} />
          </View>
          <TouchableOpacity style={mStyles.locBtn} onPress={useCurrentLocation} disabled={locLoading}>
            {locLoading
              ? <ActivityIndicator size="small" color="#4F46E5" />
              : <Text style={mStyles.locBtnTxt}>📍 Use current GPS location</Text>}
          </TouchableOpacity>

          <Text style={mStyles.label}>Address (optional)</Text>
          <TextInput style={mStyles.input} placeholder="Street address or landmark" value={address} onChangeText={setAddress} />

          <Text style={mStyles.label}>Arrival radius: {radius}m</Text>
          <View style={mStyles.chipRow}>
            {['50', '100', '200', '500'].map(r => (
              <TouchableOpacity key={r} style={[mStyles.chip, radius === r && mStyles.chipSelected]} onPress={() => setRadius(r)}>
                <Text style={radius === r ? mStyles.chipTxtSelected : mStyles.chipTxt}>{r}m</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={mStyles.toggleRow} onPress={() => setNotify(p => !p)}>
            <View style={[mStyles.toggle, notify && mStyles.toggleOn]}>
              <View style={[mStyles.toggleThumb, notify && mStyles.toggleThumbOn]} />
            </View>
            <Text style={mStyles.toggleLabel}>Notify guardians when I arrive</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
interface Props {
  onSelectPlace?: (place: TrustedPlace) => void;  // used as destination picker
  selectionMode?: boolean;
}

export default function TrustedPlacesScreen({ onSelectPlace, selectionMode = false }: Props) {
  const [places, setPlaces] = useState<TrustedPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<TrustedPlace | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await trustedPlacesApi.list();
      setPlaces(data);
    } catch (e) {
      console.warn('[TrustedPlaces] load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (payload: CreateTrustedPlacePayload, id?: string) => {
    if (id) {
      await trustedPlacesApi.update(id, payload);
    } else {
      await trustedPlacesApi.create(payload);
    }
    setModalVisible(false);
    setEditing(null);
    await load();
  };

  const handleDelete = (place: TrustedPlace) => {
    Alert.alert('Delete Trusted Place', `Remove "${place.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await trustedPlacesApi.delete(place.id);
            await load();
          } catch (e) {
            Alert.alert('Error', 'Could not delete the place. Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{selectionMode ? 'Choose Destination' : 'Trusted Places'}</Text>
        {!selectionMode && (
          <TouchableOpacity style={styles.addBtn} onPress={() => { setEditing(null); setModalVisible(true); }}>
            <Text style={styles.addBtnTxt}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>
      {!selectionMode && (
        <Text style={styles.subtitle}>Save frequently visited locations for quick Safe Window setup.</Text>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#4F46E5" /></View>
      ) : places.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📍</Text>
          <Text style={styles.emptyTitle}>No trusted places yet</Text>
          <Text style={styles.emptyText}>Add locations like Home or College to start Safe Windows faster.</Text>
          <PrimaryButton title="Add trusted place" onPress={() => { setEditing(null); setModalVisible(true); }} style={{ marginTop: 16 }} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {places.map(place => (
            <TouchableOpacity
              key={place.id}
              style={styles.card}
              onPress={() => selectionMode && onSelectPlace ? onSelectPlace(place) : undefined}
              activeOpacity={selectionMode ? 0.7 : 1}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.cardIcon}>
                  {place.label ? TRUSTED_PLACE_LABEL_ICONS[place.label as TrustedPlaceLabel] : '📍'}
                </Text>
                <View>
                  <Text style={styles.cardName}>{place.name}</Text>
                  {place.label && <Text style={styles.cardLabel}>{place.label}</Text>}
                  {place.address ? (
                    <Text style={styles.cardAddr} numberOfLines={1}>{place.address}</Text>
                  ) : (
                    <Text style={styles.cardAddr}>{place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}</Text>
                  )}
                  <Text style={styles.cardRadius}>Radius: {place.radius_meters}m</Text>
                </View>
              </View>
              {!selectionMode && (
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => { setEditing(place); setModalVisible(true); }} style={styles.editBtn}>
                    <Text style={styles.editTxt}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(place)} style={styles.delBtn}>
                    <Text style={styles.delTxt}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              )}
              {selectionMode && (
                <Text style={{ fontSize: 18, color: '#4F46E5' }}>›</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <PlaceFormModal
        visible={modalVisible}
        initial={editing}
        onClose={() => { setModalVisible(false); setEditing(null); }}
        onSave={handleSave}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '900', color: '#1E293B' },
  subtitle: { fontSize: 14, color: '#64748B', paddingHorizontal: 24, marginBottom: 12 },
  addBtn: { backgroundColor: '#4F46E5', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addBtnTxt: { color: 'white', fontWeight: '700', fontSize: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingTop: 8 },
  card: { backgroundColor: 'white', borderRadius: 14, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  cardIcon: { fontSize: 28, marginRight: 12, marginTop: 2 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  cardLabel: { fontSize: 12, color: '#4F46E5', fontWeight: '600', marginTop: 2 },
  cardAddr: { fontSize: 12, color: '#64748B', marginTop: 2, maxWidth: 200 },
  cardRadius: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 8 },
  editBtn: { padding: 8, backgroundColor: '#EEF2FF', borderRadius: 8 },
  editTxt: { fontSize: 16 },
  delBtn: { padding: 8, backgroundColor: '#FEE2E2', borderRadius: 8 },
  delTxt: { fontSize: 16 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center' },
});

const mStyles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#FAFAF9' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  cancel: { fontSize: 16, color: '#64748B' },
  title: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  save: { fontSize: 16, color: '#4F46E5', fontWeight: '700' },
  body: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 14, fontSize: 15, color: '#1E293B', marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  chipTxt: { fontSize: 13, color: '#475569', fontWeight: '500' },
  chipTxtSelected: { fontSize: 13, color: 'white', fontWeight: '600' },
  row: { flexDirection: 'row' },
  locBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#EEF2FF', borderRadius: 10, marginTop: 8, alignSelf: 'flex-start' },
  locBtnTxt: { color: '#4F46E5', fontWeight: '600', fontSize: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#E2E8F0', justifyContent: 'center', paddingHorizontal: 2 },
  toggleOn: { backgroundColor: '#4F46E5' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  toggleThumbOn: { alignSelf: 'flex-end' },
  toggleLabel: { fontSize: 14, color: '#334155', marginLeft: 10, fontWeight: '500' },
  errorBox: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 8, padding: 12, marginBottom: 8 },
  errorTxt: { color: '#DC2626', fontSize: 13, fontWeight: '500' },
});
