import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from './AppHeader';
import { Logo } from './Logo';

export interface DrawerItem {
  route: string;
  icon: any;
  label: string;
}

interface DrawerLayoutProps {
  menuItems: readonly DrawerItem[];
  sidebarTitle?: string;
  accentColor?: string;
  activeBgColor?: string;
  activeTextColor?: string;
}

const DRAWER_WIDTH = 280;
const ANIM_DURATION = 250;

export function DrawerLayout({
  menuItems,
  sidebarTitle,
  accentColor = '#3B82F6',
  activeBgColor = '#2196F3',
  activeTextColor = '#FFFFFF',
}: DrawerLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const toggleDrawer = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeDrawer = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (sidebarOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: ANIM_DURATION - 50,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: ANIM_DURATION - 50,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: ANIM_DURATION - 50,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [sidebarOpen, slideAnim, backdropAnim]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sidebarOpen) {
        closeDrawer();
        return true;
      }
      return false;
    });
    return () => backHandler.remove();
  }, [sidebarOpen, closeDrawer]);

  const isActive = useCallback(
    (route: string) => {
      const norm = (p: string) => p.replace(/\/+/g, '/').replace(/\/$/, '');
      return norm(pathname) === norm(route);
    },
    [pathname],
  );

  const handleNavigate = useCallback(
    (route: string) => {
      router.push(route as any);
      closeDrawer();
    },
    [router, closeDrawer],
  );

  return (
    <View className="flex-1 bg-slate-50">
      <AppHeader />

      <View className="flex-1">
        <Slot />
      </View>

      <Pressable
        onPress={toggleDrawer}
        accessibilityLabel={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
        accessibilityRole="button"
        className="absolute z-50 rounded-xl border border-slate-200 bg-white active:bg-slate-50"
        style={{
          top: insets.top + 8,
          right: 12,
          padding: Platform.OS === 'ios' ? 10 : 12,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather
          name={sidebarOpen ? 'x' : 'menu'}
          size={24}
          color={accentColor}
        />
      </Pressable>

      <Animated.View
        className="absolute left-0 top-0 z-40 h-full bg-blue-500"
        style={{
          width: DRAWER_WIDTH,
          paddingTop: insets.top,
          transform: [{ translateX: slideAnim }],
          elevation: 16,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 20,
          shadowOffset: { width: 2, height: 4 },
        }}
      >
        <View className="mb-2 mt-4 items-center justify-center border-b border-slate-100 pb-6">
          <Logo size={72} />
          {sidebarTitle && (
            <Text className="mt-2 text-base font-bold text-white">
              {sidebarTitle}
            </Text>
          )}
        </View>

        <View className="flex-1 px-3">
          {menuItems.map((item) => {
            const active = isActive(item.route);
            return (
              <Pressable
                key={item.route}
                onPress={() => handleNavigate(item.route)}
                accessibilityLabel={item.label}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className="mb-1 flex-row items-center rounded-xl px-3 py-3.5 active:opacity-80"
                style={{
                  backgroundColor: active ? activeBgColor : 'transparent',
                }}
              >
                <View
                  className="h-9 w-9 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: active
                      ? activeTextColor + '15'
                      : 'transparent',
                  }}
                >
                  <Feather
                    name={item.icon}
                    size={20}
                    color={active ? activeTextColor : '#ffffff'}
                  />
                </View>
                <Text
                  className="ml-3 text-[15px]"
                  style={{
                    color: active ? activeTextColor : '#ffffff',
                    fontWeight: active ? '600' : '400',
                  }}
                >
                  {item.label}
                </Text>
                {active && (
                  <View
                    className="ml-auto h-2 w-2 rounded-full"
                    style={{ backgroundColor: activeTextColor }}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents={sidebarOpen ? 'auto' : 'none'}
        style={[
          { opacity: backdropAnim },
          StyleSheet.absoluteFill,
          { zIndex: 30 },
        ]}
      >
        <Pressable
          onPress={closeDrawer}
          accessibilityLabel="Close navigation menu"
          accessibilityRole="button"
          className="bg-black/40"
          style={{ marginLeft: DRAWER_WIDTH, flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}
