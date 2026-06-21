import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'emergency' | 'dark' | 'safe' | 'warning' | 'normal';
  disabled?: boolean;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({ 
  title, 
  onPress, 
  variant = 'normal', 
  disabled = false 
}) => {
  return (
    <TouchableOpacity 
      style={[
        styles.button, 
        styles[variant],
        disabled && styles.disabled
      ]} 
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    width: '100%',
  },
  emergency: {
    backgroundColor: '#DC2626',
  },
  dark: {
    backgroundColor: '#111827',
  },
  safe: {
    backgroundColor: '#16A34A',
  },
  warning: {
    backgroundColor: '#F59E0B',
  },
  normal: {
    backgroundColor: '#374151',
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
