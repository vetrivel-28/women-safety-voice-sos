import React, { useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, Animated } from 'react-native';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'dark' | 'emergency';
  style?: ViewStyle;
  disabled?: boolean;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({ 
  title, 
  onPress, 
  variant = 'primary', 
  style,
  disabled 
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 20,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 10,
    }).start();
  };

  return (
    <AnimatedTouchable 
      style={[
        styles.button, 
        styles[variant as keyof typeof styles], 
        disabled && styles.disabled, 
        style,
        { transform: [{ scale: scaleAnim }] }
      ] as any} 
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.8}
      disabled={disabled}
    >
      <Text style={[styles.text, styles[`${variant}Text` as keyof typeof styles]]}>{title}</Text>
    </AnimatedTouchable>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    width: '100%',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  primary: { backgroundColor: '#4F46E5' },
  primaryText: { color: '#FFFFFF' },
  secondary: { backgroundColor: '#F1F5F9' },
  secondaryText: { color: '#1E293B' },
  danger: { backgroundColor: '#EF4444' },
  dangerText: { color: '#FFFFFF' },
  outline: { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#CBD5E1', elevation: 0, shadowOpacity: 0 },
  outlineText: { color: '#475569' },
  dark: { backgroundColor: '#1E293B' },
  darkText: { color: '#FFFFFF' },
  emergency: { backgroundColor: '#DC2626', shadowColor: '#DC2626', shadowOpacity: 0.3 },
  emergencyText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
});
