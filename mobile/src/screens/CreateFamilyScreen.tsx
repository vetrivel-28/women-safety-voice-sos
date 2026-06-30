import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { PrimaryButton } from '../components/PrimaryButton';
import { useFamily } from '../context/FamilyContext';

export default function CreateFamilyScreen() {
  const navigation = useNavigation();
  const { createFamily, family } = useFamily();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-check: If already in a family, we shouldn't be here.
  useEffect(() => {
    if (family) {
      // Redirect to dashboard if they somehow landed here
      navigation.navigate('FamilyDashboard' as never);
    }
  }, [family, navigation]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Family name is required');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      await createFamily(name.trim());
      // On success, the context will update `family`, and the useEffect above will redirect,
      // or we can manually redirect here.
      navigation.navigate('FamilyDashboard' as never);
    } catch (e: any) {
      if (e.response && e.response.data && e.response.data.detail) {
        setError(e.response.data.detail);
      } else {
        setError(e.message || 'Failed to create family. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>Create a Family</Text>
          <Text style={styles.subtitle}>
            Enter a name for your family group. You can invite members later.
          </Text>
          
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="e.g. The Smiths"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError(null);
            }}
            autoFocus
            editable={!loading}
          />
          
          <PrimaryButton 
            title={loading ? "Creating..." : "Create Family"} 
            onPress={handleCreate}
            disabled={loading || !name.trim()}
            style={{ width: '100%' }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16 },
  backButton: { padding: 8 },
  backText: { fontSize: 16, color: '#4F46E5', fontWeight: '500' },
  content: { padding: 24, flex: 1, justifyContent: 'center', marginTop: -60 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 8, textAlign: 'center', color: '#1E293B' },
  subtitle: { fontSize: 16, color: '#64748B', textAlign: 'center', marginBottom: 32 },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: '#DC2626', fontSize: 14, textAlign: 'center', fontWeight: '500' },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    marginBottom: 24,
    color: '#1E293B'
  },
  inputError: {
    borderColor: '#EF4444',
  }
});
