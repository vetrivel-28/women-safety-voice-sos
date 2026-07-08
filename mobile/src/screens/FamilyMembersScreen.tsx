import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFamily } from '../context/FamilyContext';
import { supabase } from '../lib/supabaseClient';

export default function FamilyMembersScreen() {
  const { family, members, joinRequests, removeMember, approveJoin, rejectJoin } = useFamily();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  
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

  const handleApprove = async (requestId: string) => {
    setProcessingRequestId(requestId);
    setError(null);
    try {
      await approveJoin(requestId);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || "Failed to approve request");
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setProcessingRequestId(requestId);
    setError(null);
    try {
      await rejectJoin(requestId);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || "Failed to reject request");
    } finally {
      setProcessingRequestId(null);
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {isHost && (
          <View style={styles.requestsSection}>
            <Text style={styles.title}>Pending Join Requests</Text>
            {joinRequests.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No pending requests</Text>
              </View>
            ) : (
              joinRequests.map((req: any) => (
                <View key={req.id} style={styles.requestCard}>
                  <View>
                    <Text style={styles.reqName}>{req.profiles?.full_name || req.profiles?.email}</Text>
                    <Text style={styles.reqTime}>Requested: {formatTime(req.created_at)}</Text>
                  </View>
                  <View style={styles.requestActions}>
                    <TouchableOpacity 
                      style={[styles.approveBtn, processingRequestId === req.id && { opacity: 0.5 }]} 
                      onPress={() => handleApprove(req.id)}
                      disabled={processingRequestId !== null}
                    >
                      {processingRequestId === req.id ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.btnTextWhite}>Approve</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.rejectBtn, processingRequestId === req.id && { opacity: 0.5 }]} 
                      onPress={() => handleReject(req.id)}
                      disabled={processingRequestId !== null}
                    >
                      <Text style={styles.btnTextDark}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <Text style={styles.title}>Family Members</Text>
        
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
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#1E293B' },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: '#DC2626', fontSize: 14, textAlign: 'center', fontWeight: '500' },
  requestsSection: { marginBottom: 32 },
  emptyState: { padding: 16, backgroundColor: 'white', borderRadius: 12, alignItems: 'center' },
  emptyText: { color: '#64748B', fontStyle: 'italic' },
  requestCard: { backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12 },
  reqName: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  reqTime: { fontSize: 12, color: '#64748B', marginTop: 4 },
  requestActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  approveBtn: { flex: 1, backgroundColor: '#4F46E5', paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { flex: 1, backgroundColor: '#F1F5F9', paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnTextWhite: { color: 'white', fontWeight: '600' },
  btnTextDark: { color: '#334155', fontWeight: '600' },
  card: { backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberInfo: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 16, fontWeight: 'bold', color: '#64748B' },
  name: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  role: { fontSize: 12, color: '#64748B', marginTop: 4, fontWeight: '500' },
  removeBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#FEF2F2', borderRadius: 8 },
  removeText: { color: '#DC2626', fontWeight: '600', fontSize: 13 }
});
