import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import * as Linking from 'expo-linking';

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  console.log("LOGIN_SCREEN_VERSION_1");

  // Common
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register only
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [dob, setDob] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

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
    const redirectUrl = Linking.createURL('');
    
    const {
      data: { session },
      error,
    } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          mobile_number: mobileNumber,
          dob,
          emergency_contact_name: emergencyContactName,
          emergency_contact_phone: emergencyContactPhone,
        }
      }
    });

    if (error) {
      Alert.alert('Sign up failed', error.message);
    } else if (!session) {
      Alert.alert('Success', 'Please check your inbox for email verification!');
      setIsLogin(true);
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>SafeHer</Text>
        <Text style={styles.subtitle}>{isLogin ? 'Welcome Back' : 'Create an Account'}</Text>

        {!isLogin && (
          <>
            <Text style={styles.inputLabel}>Full Name *</Text>
            <TextInput
              style={[styles.input, { color: '#111827' }]}
              onChangeText={setFullName}
              value={fullName}
              placeholder="Full Name *"
              placeholderTextColor="#6B7280"
              autoCapitalize="words"
            />
            <Text style={styles.inputLabel}>Phone Number *</Text>
            <TextInput
              style={[styles.input, { color: '#111827' }]}
              onChangeText={setMobileNumber}
              value={mobileNumber}
              placeholder="Phone Number *"
              placeholderTextColor="#6B7280"
              keyboardType="phone-pad"
            />
          </>
        )}

        <Text style={styles.inputLabel}>Email Address *</Text>
        <TextInput
          style={[styles.input, { color: '#111827' }]}
          onChangeText={setEmail}
          value={email}
          placeholder="Email Address *"
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text style={styles.inputLabel}>Password *</Text>
        <TextInput
          style={[styles.input, { color: '#111827' }]}
          onChangeText={setPassword}
          value={password}
          secureTextEntry={true}
          placeholder="Password *"
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
        />

        {!isLogin && (
          <>
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>Optional Details</Text>
            <Text style={styles.inputLabel}>Date of Birth (Optional)</Text>
            <TextInput
              style={[styles.input, { color: '#111827' }]}
              onChangeText={setDob}
              value={dob}
              placeholder="Date of Birth (YYYY-MM-DD)"
              placeholderTextColor="#6B7280"
            />
            <Text style={styles.inputLabel}>Emergency Contact Name</Text>
            <TextInput
              style={[styles.input, { color: '#111827' }]}
              onChangeText={setEmergencyContactName}
              value={emergencyContactName}
              placeholder="Emergency Contact Name"
              placeholderTextColor="#6B7280"
              autoCapitalize="words"
            />
            <Text style={styles.inputLabel}>Emergency Contact Phone</Text>
            <TextInput
              style={[styles.input, { color: '#111827' }]}
              onChangeText={setEmergencyContactPhone}
              value={emergencyContactPhone}
              placeholder="Emergency Contact Phone"
              placeholderTextColor="#6B7280"
              keyboardType="phone-pad"
            />
          </>
        )}

        <View style={styles.buttonContainer}>
          {isLogin ? (
            <>
              <TouchableOpacity style={styles.button} onPress={signInWithEmail} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkButton} onPress={() => setIsLogin(false)} disabled={loading}>
                <Text style={styles.linkButtonText}>Don't have an account? Sign Up</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.button} onPress={signUpWithEmail} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkButton} onPress={() => setIsLogin(true)} disabled={loading}>
                <Text style={styles.linkButtonText}>Already have an account? Sign In</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF7F7',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 15,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 20,
  },
  input: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginLeft: 4,
  },
  buttonContainer: {
    marginTop: 10,
  },
  button: {
    backgroundColor: '#EF4444',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  linkButton: {
    padding: 10,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 14,
  },
});
