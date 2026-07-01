import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useFamily } from '../context/FamilyContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader } from '../components/SectionHeader';
import { supabase } from '../lib/supabaseClient';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'FamilyDashboard'>;

export default function FamilyDashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { family, members, joinRequests, activeSOS, activeJourneys, loading, refresh, approveJoin, rejectJoin, myPendingRequest, pendingFamilyName } = useFamily();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
         setCurrentUserId(data.session.user.id);
      }
    });
  }, []);

  if (loading && !family) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading Family...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  if (myPendingRequest) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.title}>Request Pending</Text>
          <Text style={styles.subtitle}>
            Waiting for host approval to join "{pendingFamilyName || 'the family'}".
          </Text>
          <PrimaryButton 
             title="Check Status" 
             onPress={refresh} 
             variant="outline"
             style={{ width: '100%', marginTop: 20 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!family) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.noFamilyContainer}>
          <Text style={styles.title}>Family Safety Network</Text>
          <Text style={styles.subtitle}>
            Create or join a family group to share live locations, journeys, and SOS alerts instantly.
          </Text>
          <PrimaryButton 
            title="Create a New Family" 
            onPress={() => navigation.navigate('CreateFamily' as never)} 
            style={{ marginBottom: 12, width: '100%' }}
          />
          <PrimaryButton 
            title="Join an Existing Family" 
            variant="outline" 
            onPress={() => navigation.navigate('JoinFamily')} 
            style={{ width: '100%' }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const isHost = family.host_user_id === currentUserId;
  const hostMember = members.find(m => m.user_id === family.host_user_id);
  const hostName = hostMember?.profiles?.full_name || 'Host';

  const handleSharePin = async () => {
    try {
      await Share.share({
        message: `Join my SafeHer Family "${family.family_name}" using PIN: ${family.family_pin}`,
        title: 'Join my SafeHer Family'
      });
    } catch (error) {
      console.error(error);
    }
  };

  const renderMemberStatus = (member: any) => {
    const isSOS = activeSOS.some(sos => sos.user_id === member.user_id);
    const isJourney = activeJourneys.some(j => j.user_id === member.user_id);
    
    if (isSOS) return <Text style={[styles.statusBadge, styles.statusSOS]}>SOS ACTIVE</Text>;
    if (isJourney) return <Text style={[styles.statusBadge, styles.statusJourney]}>On Journey</Text>;
    return <Text style={[styles.statusBadge, styles.statusSafe]}>Safe</Text>;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{family.family_name}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('FamilySettings')}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerCardRow}>
            <Text style={styles.headerCardLabel}>Host</Text>
            <Text style={styles.headerCardValue}>{hostName} {isHost ? '(You)' : ''}</Text>
          </View>
          <View style={styles.headerCardRow}>
            <Text style={styles.headerCardLabel}>Members</Text>
            <Text style={styles.headerCardValue}>{members.length}</Text>
          </View>
          {isHost && (
            <View style={[styles.headerCardRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
              <Text style={styles.headerCardLabel}>Join PIN</Text>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Text style={styles.pinText}>{family.family_pin}</Text>
                <TouchableOpacity onPress={handleSharePin} style={{marginLeft: 12}}>
                  <Text style={{fontSize: 20}}>📤</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Active SOS Banner */}
        {activeSOS.length > 0 && (
          <TouchableOpacity style={styles.sosBanner} onPress={() => navigation.navigate('FamilyLiveMap')}>
            <Text style={styles.sosBannerText}>⚠️ SOS ACTIVE ⚠️</Text>
            {activeSOS.map((sos: any) => {
              const victim = members.find(m => m.user_id === sos.user_id);
              return (
                <Text key={sos.id} style={styles.sosDetailText}>
                  {victim?.profiles?.full_name || 'A member'} needs help immediately!
                </Text>
              );
            })}
          </TouchableOpacity>
        )}

        {/* Members List */}
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          <SectionHeader title="Family Members" />
          {isHost && (
             <TouchableOpacity onPress={handleSharePin}>
               <Text style={styles.inviteText}>+ Invite</Text>
             </TouchableOpacity>
          )}
        </View>
        
        {members.length === 1 && isHost ? (
          <View style={styles.emptyState}>
            <Text style={{fontSize: 32, marginBottom: 8}}>👨‍👩‍👧‍👦</Text>
            <Text style={styles.emptyStateTitle}>Invite someone to get started</Text>
            <Text style={styles.emptyStateSub}>Share your family PIN to add members to your safety network.</Text>
            <TouchableOpacity style={styles.emptyStateBtn} onPress={handleSharePin}>
              <Text style={styles.emptyStateBtnText}>Share PIN</Text>
            </TouchableOpacity>
          </View>
        ) : (
          members.map((member: any) => (
            <View key={member.id} style={styles.memberCard}>
              <View style={styles.memberInfo}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{member.profiles?.full_name?.charAt(0) || '?'}</Text>
                </View>
                <View>
                  <Text style={styles.memberName}>{member.profiles?.full_name || member.profiles?.email}</Text>
                  <Text style={styles.memberRole}>{member.role.toUpperCase()}</Text>
                </View>
              </View>
              <View style={{alignItems: 'flex-end'}}>
                 {renderMemberStatus(member)}
              </View>
            </View>
          ))
        )}

        <View style={styles.actionsGrid}>
          <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('FamilyLiveMap')}>
            <Text style={styles.actionIcon}>🗺️</Text>
            <Text style={styles.actionText}>Live Map</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('FamilyMembers')}>
            <Text style={styles.actionIcon}>👥</Text>
            <Text style={styles.actionText}>Manage</Text>
          </TouchableOpacity>
        </View>

        {isHost && joinRequests.length > 0 && (
          <View style={styles.requestsContainer}>
            <SectionHeader title="Pending Join Requests" />
            {joinRequests.map((req: any) => (
              <View key={req.id} style={styles.requestCard}>
                <Text style={styles.reqName}>{req.profiles?.full_name || req.profiles?.email}</Text>
                <Text style={styles.reqTime}>wants to join</Text>
                <View style={styles.requestActions}>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => approveJoin(req.id)}>
                    <Text style={{color: 'white', fontWeight: '500'}}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectJoin(req.id)}>
                    <Text style={{color: '#64748B', fontWeight: '500'}}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { padding: 24, paddingBottom: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { fontSize: 16, color: '#64748B' },
  noFamilyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '900', color: '#1E293B', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#64748B', textAlign: 'center', marginBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  settingsIcon: { fontSize: 24 },
  
  headerCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2
  },
  headerCardRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    paddingVertical: 12
  },
  headerCardLabel: { fontSize: 14, color: '#64748B' },
  headerCardValue: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  pinText: { fontSize: 18, fontWeight: 'bold', letterSpacing: 2, color: '#4F46E5', backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  
  sosBanner: { backgroundColor: '#EF4444', padding: 16, borderRadius: 12, marginBottom: 24, shadowColor: '#EF4444', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  sosBannerText: { color: 'white', fontWeight: 'bold', fontSize: 18, textAlign: 'center' },
  sosDetailText: { color: 'white', textAlign: 'center', marginTop: 8, fontWeight: '500' },
  
  inviteText: { color: '#4F46E5', fontWeight: '600', fontSize: 14 },
  
  emptyState: { backgroundColor: 'white', borderRadius: 12, padding: 32, alignItems: 'center', marginBottom: 16 },
  emptyStateTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B', marginBottom: 8 },
  emptyStateSub: { fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 16 },
  emptyStateBtn: { backgroundColor: '#EEF2FF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  emptyStateBtnText: { color: '#4F46E5', fontWeight: '600' },
  
  memberCard: { backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberInfo: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 16, fontWeight: 'bold', color: '#64748B' },
  memberName: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  memberRole: { fontSize: 12, color: '#64748B', marginTop: 2 },
  
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  statusSafe: { backgroundColor: '#DCFCE7', color: '#166534' },
  statusJourney: { backgroundColor: '#FEF9C3', color: '#854D0E' },
  statusSOS: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  
  actionsGrid: { flexDirection: 'row', gap: 12, marginTop: 12 },
  actionButton: { flex: 1, backgroundColor: 'white', padding: 16, borderRadius: 12, alignItems: 'center' },
  actionIcon: { fontSize: 24, marginBottom: 8 },
  actionText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  
  requestsContainer: { marginTop: 24 },
  requestCard: { backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12 },
  reqName: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  reqTime: { fontSize: 13, color: '#64748B', marginTop: 2 },
  requestActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  approveBtn: { flex: 1, backgroundColor: '#4F46E5', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  rejectBtn: { flex: 1, backgroundColor: '#F1F5F9', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
});
