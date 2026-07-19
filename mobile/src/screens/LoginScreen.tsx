import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import * as Linking from 'expo-linking';
import { PrimaryButton } from '../components/PrimaryButton';
import { API_BASE_URL } from '../api/client';

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  // Common
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register only
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');

  async function signInWithEmail() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) Alert.alert('Sign in failed', error.message);
    setLoading(false);
  }

  async function signUpWithEmail() {
    if (!fullName || !mobileNumber || !email || !password) {
      Alert.alert('Error', 'Please fill in all required fields (Name, Mobile, Email, Password)');
      return;
    }

    const basicPhoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/im;
    if (!basicPhoneRegex.test(mobileNumber)) {
      Alert.alert('Error', 'Please enter a valid mobile number');
      return;
    }

    setLoading(true);
    
    try {
      // Generate idempotency key
      const signupRequestId = `${email}_${Date.now()}`;
      
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
          mobile_number: mobileNumber,
          signup_request_id: signupRequestId
        })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch((e) => { console.warn('[Login] Failed to parse error response', e); return {}; });
        throw new Error(errData.detail || 'Failed to sign up');
      }
      
      const data = await response.json();
      if (data.message === 'User already exists. Please login.') {
        Alert.alert('Info', data.message);
        setIsLogin(true);
      } else {
        Alert.alert('Success', 'Account created successfully! Please sign in.');
        setIsLogin(true);
      }
    } catch (error: any) {
      Alert.alert('Sign up failed', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        
        <View style={styles.header}>
          <View style={styles.iconWrapper}>
            <Text style={styles.icon}>🛡️</Text>
          </View>
          <Text style={styles.title}>SafeHer</Text>
          <Text style={styles.subtitle}>Emergency help, quietly when needed.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{isLogin ? 'Welcome Back' : 'Create an Account'}</Text>
          
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>Secure your account to manage your trusted guardians.</Text>
          </View>

          {!isLogin && (
            <>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                onChangeText={setFullName}
                value={fullName}
                placeholder="Jane Doe"
                placeholderTextColor="#94A3B8"
                autoCapitalize="words"
              />
              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={styles.input}
                onChangeText={setMobileNumber}
                value={mobileNumber}
                placeholder="+1 234 567 8900"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
              />
            </>
          )}

          <Text style={styles.inputLabel}>Email Address</Text>
          <TextInput
            style={styles.input}
            onChangeText={setEmail}
            value={email}
            placeholder="jane@example.com"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          
          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={styles.input}
            onChangeText={setPassword}
            value={password}
            secureTextEntry={true}
            placeholder="••••••••"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
          />

          <View style={styles.buttonContainer}>
            {isLogin ? (
              <>
                <PrimaryButton 
                  title={loading ? "Authenticating..." : "Sign In"} 
                  onPress={signInWithEmail} 
                  disabled={loading} 
                  variant="primary" 
                />
                <TouchableOpacity style={styles.linkButton} onPress={() => setIsLogin(false)} disabled={loading}>
                  <Text style={styles.linkButtonText}>Don't have an account? <Text style={styles.linkBold}>Sign Up</Text></Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <PrimaryButton 
                  title={loading ? "Creating..." : "Create Account"} 
                  onPress={signUpWithEmail} 
                  disabled={loading} 
                  variant="primary" 
                />
                <TouchableOpacity style={styles.linkButton} onPress={() => setIsLogin(true)} disabled={loading}>
                  <Text style={styles.linkButtonText}>Already have an account? <Text style={styles.linkBold}>Sign In</Text></Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF9', // Warm off-white
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 36,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#1E293B',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 20,
  },
  noticeBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4F46E5',
    marginBottom: 20,
  },
  noticeText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#F1F5F9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  buttonContainer: {
    marginTop: 8,
  },
  linkButton: {
    padding: 16,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#64748B',
    fontSize: 15,
  },
  linkBold: {
    color: '#4F46E5',
    fontWeight: '700',
  },
});
