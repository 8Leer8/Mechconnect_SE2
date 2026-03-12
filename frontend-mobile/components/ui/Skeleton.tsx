import React, { useContext, useEffect, createContext } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  SharedValue,
} from 'react-native-reanimated';

const SkeletonContext = createContext<SharedValue<number> | null>(null);

/** Wrap multiple Skeleton elements in a SkeletonGroup so they pulse in sync. */
export function SkeletonGroup({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);
  return (
    <SkeletonContext.Provider value={opacity}>
      {children}
    </SkeletonContext.Provider>
  );
}

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  circle?: boolean;
  style?: ViewStyle;
}

/** Animated skeleton placeholder with pulse animation. */
export function Skeleton({
  width = '100%',
  height = 14,
  borderRadius = 8,
  circle = false,
  style,
}: SkeletonProps) {
  const shared = useContext(SkeletonContext);
  const local = useSharedValue(0.3);

  useEffect(() => {
    if (!shared) {
      local.value = withRepeat(
        withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    }
  }, [shared]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: shared ? shared.value : local.value,
  }));

  const size: ViewStyle = circle
    ? {
        width: typeof width === 'number' ? width : 40,
        height: typeof width === 'number' ? width : 40,
        borderRadius: typeof width === 'number' ? width / 2 : 20,
      }
    : { width, height, borderRadius };

  return (
    <Animated.View
      style={[{ backgroundColor: '#3A3A3C' }, size, animatedStyle, style]}
    />
  );
}
