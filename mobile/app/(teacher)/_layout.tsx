import { Redirect, Slot, useRouter, usePathname } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Platform, Text, View, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { AppHeader } from '../../components/AppHeader';
import { LoadingScreen } from '../../components/LoadingScreen';
import { Logo } from '../../components/Logo';

const MENU_ITEMS = [
  { route: '/(teacher)/inbox', icon: 'inbox', label: 'Dashboard', roles: ['teacher', 'coordinator', 'student'] },
  { route: '/(teacher)/documents', icon: 'file-text', label: 'Materials', roles: ['teacher', 'student'] },
  { route: '/(teacher)/groups', icon: 'users', label: 'Groups', roles: ['teacher', 'coordinator', 'student'] },
  { route: '/(teacher)/chat', icon: 'message-circle', label: 'Chat', roles: ['teacher', 'coordinator', 'student'] },
  { route: '/(teacher)/availability', icon: 'calendar', label: 'Calendar', roles: ['teacher'] },
  { route: '/(teacher)/profile', icon: 'user', label: 'Profile', roles: ['teacher', 'coordinator', 'student'] },
] as const;

export default function AppLayout() {
  const { session, profile, loading, hasRole } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;

  if (profile?.role === 'admin') {
    return <Redirect href="/(auth)/login?admin=1" />;
  }

  // Dynamic Route Guard
  const currentMenuItem = MENU_ITEMS.find(item => 
    pathname === item.route || 
    pathname === item.route.replace('/(teacher)', '') ||
    pathname.endsWith(item.route.split('/').pop() || '')
  );

  if (currentMenuItem && !hasRole(currentMenuItem.roles as any)) {
    return <Redirect href="/" />;
  }

  const filteredMenuItems = MENU_ITEMS.filter(item => 
    !item.roles || hasRole(item.roles as any)
  );

  return (
    <View style={{ flex: 1 }}>
      <AppHeader />

      {/* Sidebar Toggle */}
      <TouchableOpacity
        onPress={() => setSidebarOpen(!sidebarOpen)}
        style={{
          position: 'absolute',
          top: Platform.OS === 'ios' ? 60 : 20,
          right: 16,
          zIndex: 100,
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          padding: 8,
          borderRadius: 12,
        }}
      >
        <Feather
          name={sidebarOpen ? 'x' : 'menu'}
          size={24}
          color="#3B82F6"
        />
      </TouchableOpacity>

      {/* Sidebar */}
      {sidebarOpen && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 260,
            height: '100%',
            backgroundColor: '#fff',
            zIndex: 99,
            paddingTop: 120,
            elevation: 12,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 12,
          }}
        >

          {/* Logo Section */}
  <View
    style={{
      alignItems: 'center',
      paddingBottom: 24,
      borderBottomWidth: 1,
      borderBottomColor: '#E2E8F0',
      marginBottom: 12,
      justifyContent: 'center',
    }}
  >
    <Logo size={80} />

    {/* <Text
      style={{
        marginTop: 6,
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
      }}
    >
      GenieClasses
    </Text> */}
  </View>

          {filteredMenuItems.map((item) => {
            const active = pathname.includes(
              item.route.split('/').pop() || ''
            );

            return (
              <TouchableOpacity
                key={item.route}
                onPress={() => {
                  const targetRoute = item.label === 'Dashboard' 
                    ? (profile?.role === 'student' 
                        ? '/(student)/dashboard' 
                        : (profile?.role === 'coordinator' 
                            ? '/(coordinator)/dashboard' 
                            : '/(teacher)/inbox'))
                    : item.label === 'Chat'
                      ? (profile?.role === 'student'
                          ? '/(student)/chat'
                          : (profile?.role === 'coordinator'
                              ? '/(coordinator)/chat'
                              : '/(teacher)/chat'))
                      : item.route;
                  router.push(targetRoute as any);
                  setSidebarOpen(false);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  backgroundColor: active ? '#DBEAFE' : 'transparent',
                }}
              >
                <Feather
                  name={item.icon}
                  size={20}
                  color={active ? '#3B82F6' : '#64748B'}
                />

                <Text
                  style={{
                    marginLeft: 12,
                    fontSize: 16,
                    color: active ? '#3B82F6' : '#334155',
                    fontWeight: active ? '600' : '400',
                  }}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Overlay */}
      {sidebarOpen && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setSidebarOpen(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 260,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.25)',
            zIndex: 98,
          }}
        />
      )}

      {/* Current Screen */}
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </View>
  );
}