import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';

type Variant = 'emergency' | 'dark' | 'safe' | 'normal';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  style?: ViewStyle;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({ 
  title, 
  onPress, 
  variant = 'normal',
  style 
}) => {
  return (
    <TouchableOpacity 
      style={[styles.button, styles[variant], style]} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.text, variant === 'normal' ? styles.textNormal : styles.textLight]}>
        {title}
      </Text>
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
  normal: {
    backgroundColor: '#E5E7EB',
  },
  text: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  textLight: {
    color: '#FFFFFF',
  },
  textNormal: {
    color: '#111827',
  },
});
