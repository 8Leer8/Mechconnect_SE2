import React from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface TopNavProps {
  title?: string;
  showBack?: boolean;
  onBackPress?: () => void;
  showNotification?: boolean;
  onNotificationPress?: () => void;
  showMenu?: boolean;
  onMenuPress?: () => void;
  showStatus?: boolean;
  isOnline?: boolean;
  onStatusToggle?: () => void;
}

export function MechanicTopNav({
  title = 'MechConnect',
  showBack = false,
  onBackPress,
  showNotification = true,
  onNotificationPress,
  showMenu = false,
  onMenuPress,
  showStatus = true,
  isOnline = false,
  onStatusToggle,
}: TopNavProps) {
  const colorScheme = useColorScheme();
  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const textColor = Colors[colorScheme ?? 'light'].text;
  const tintColor = Colors[colorScheme ?? 'light'].tint;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      <View style={styles.leftSection}>
        {showBack && onBackPress && (
          <TouchableOpacity onPress={onBackPress} style={styles.iconButton}>
            <IconSymbol size={24} name="chevron.left" color={tintColor} />
          </TouchableOpacity>
        )}
        {showMenu && onMenuPress && (
          <TouchableOpacity onPress={onMenuPress} style={styles.iconButton}>
            <IconSymbol size={24} name="line.horizontal.3" color={tintColor} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.centerSection}>
        <ThemedText style={[styles.title, { color: textColor }]}>
          {title}
        </ThemedText>
        {showStatus && (
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isOnline ? '#4CAF50' : '#757575' },
              ]}
            />
            <ThemedText style={[styles.statusText, { color: textColor }]}>
              {isOnline ? 'Online' : 'Offline'}
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.rightSection}>
        {showStatus && onStatusToggle && (
          <TouchableOpacity onPress={onStatusToggle} style={styles.iconButton}>
            <IconSymbol
              size={24}
              name={isOnline ? 'power' : 'power'}
              color={isOnline ? '#4CAF50' : '#757575'}
            />
          </TouchableOpacity>
        )}
        {showNotification && onNotificationPress && (
          <TouchableOpacity onPress={onNotificationPress} style={styles.iconButton}>
            <IconSymbol size={24} name="bell" color={tintColor} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 60,
    paddingTop: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  centerSection: {
    flex: 2,
    alignItems: 'center',
  },
  rightSection: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  iconButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  statusText: {
    fontSize: 12,
  },
});
