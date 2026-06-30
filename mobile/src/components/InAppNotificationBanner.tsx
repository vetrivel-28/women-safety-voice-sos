import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, SafeAreaView } from 'react-native';

interface BannerProps {
  title: string;
  message: string;
  onClose: () => void;
}

export const InAppNotificationBanner: React.FC<BannerProps> = ({ title, message, onClose }) => {
  const slideAnim = React.useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 10,
    }).start();

    return () => {
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }).start();
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
      <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.content}>
          <Text style={styles.icon}>🔔</Text>
          <View style={styles.textContainer}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  container: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  icon: {
    fontSize: 24,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  closeBtn: {
    padding: 8,
  },
  closeIcon: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '800',
  }
});
