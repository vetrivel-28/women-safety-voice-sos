import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFamily } from '../context/FamilyContext';
import { supabase } from '../lib/supabaseClient';

export default function FamilyMembersScreen() {
  const { family, members, removeMember } = useFamily();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
         setCurrentUserId(data.session.user.id);
      }
    });
  }, []);

  const isHost = family?.host_user_id === currentUserId;

  const handleRemove = (memberId: string) => {
    Alert.alert(
      "Remove Member",
      "Are you sure you want to remove this member from the family?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive",
          onPress: async () => {
            setRemovingId(memberId);
            setError(null);
            try {
              await removeMember(memberId);
            } catch (e: any) {
              if (e.response && e.response.data && e.response.data.detail) {
                setError(e.response.data.detail);
              } else {
                setError(e.message || "Failed to remove member");
              }
            } finally {
              setRemovingId(null);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Family Members</Text>
        
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        
        {members.map(member => {
          const isMe = member.user_id === currentUserId;
          return (
            <View key={member.id} style={styles.card}>
              <View style={styles.memberInfo}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{member.profiles?.full_name?.charAt(0) || '?'}</Text>
                </View>
                <View>
                  <Text style={styles.name}>{member.profiles?.full_name || member.profiles?.email} {isMe ? '(You)' : ''}</Text>
                  <Text style={styles.role}>{member.role.toUpperCase()}</Text>
                </View>
              </View>
              
              {isHost && member.role !== 'host' && (
                <TouchableOpacity 
                  style={[styles.removeBtn, removingId === member.id && { opacity: 0.5 }]} 
                  onPress={() => handleRemove(member.id)}
                  disabled={removingId === member.id}
                >
                  <Text style={styles.removeText}>{removingId === member.id ? 'Removing...' : 'Remove'}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24, color: '#1E293B' },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: '#DC2626', fontSize: 14, textAlign: 'center', fontWeight: '500' },
  card: { backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberInfo: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 16, fontWeight: 'bold', color: '#64748B' },
  name: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  role: { fontSize: 12, color: '#64748B', marginTop: 4, fontWeight: '500' },
  removeBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#FEF2F2', borderRadius: 8 },
  removeText: { color: '#DC2626', fontWeight: '600', fontSize: 13 }
});
