import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { API_BASE_URL } from '../api/client';
import { useNavigation } from '@react-navigation/native';

export default function ProfileRepairScreen() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigation = useNavigation<any>();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleRetry = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setErrorMsg('Not logged in. Please sign out and log in again.');
        setLoading(false);
        return;
      }
      
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ACTIVE') {
          // Success, profile is ready
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
          });
        } else {
          setErrorMsg('Still not ready. Please try again shortly.');
        }
      } else {
        setErrorMsg('Network error. Please try again shortly.');
      }
    } catch (e) {
      setErrorMsg('Still not ready. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#FAFAF9' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#EF4444', marginBottom: 16 }}>
        Account Setup Incomplete
      </Text>
      
      <Text style={{ fontSize: 16, textAlign: 'center', color: '#475569', marginBottom: 32 }}>
        There was an issue loading your profile. This is usually due to a temporary network issue, or your safety profile could not be generated during signup.
      </Text>

      {errorMsg && (
        <Text style={{ color: '#DC2626', marginBottom: 16, textAlign: 'center', fontWeight: '500' }}>
          {errorMsg}
        </Text>
      )}

      <TouchableOpacity 
        style={{ backgroundColor: '#EF4444', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 8, marginBottom: 16, width: '100%', alignItems: 'center', opacity: loading ? 0.7 : 1 }}
        onPress={handleRetry}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Retry Profile Creation</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity 
        style={{ borderWidth: 1, borderColor: '#EF4444', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 8, width: '100%', alignItems: 'center' }}
        onPress={handleSignOut}
        disabled={loading}
      >
        <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 16 }}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}
