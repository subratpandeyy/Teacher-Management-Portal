import { Feather } from '@expo/vector-icons';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { Slot, useRouter, usePathname } from 'expo-router';
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

export function DrawerLayout({
  menuItems,
  sidebarTitle,
  accentColor = '#475569',
  activeBgColor = '#EFF6FF',
  activeTextColor = '#2563EB',
}: DrawerLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View className="flex-1">
      <AppHeader />

      <TouchableOpacity
        onPress={() => setSidebarOpen(!sidebarOpen)}
        className="absolute right-4 z-50 rounded-xl border border-slate-200 bg-white p-2"
        style={{ top: Platform.OS === 'ios' ? 60 : 20 }}
      >
        <Feather
          name={sidebarOpen ? 'x' : 'menu'}
          size={24}
          color={accentColor}
        />
      </TouchableOpacity>

      {sidebarOpen && (
        <View
          className="absolute left-0 top-0 z-40 h-full w-64 bg-white pt-[120px]"
          style={{ elevation: 12, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}
        >
          <View className="mb-3 items-center justify-center border-b border-slate-100 pb-6">
            <Logo size={80} />
            {sidebarTitle && (
              <Text className="mt-2 text-base font-bold text-slate-900">{sidebarTitle}</Text>
            )}
          </View>

          {menuItems.map((item) => {
            const active = pathname.includes(item.route.split('/').pop() || '');

            return (
              <TouchableOpacity
                key={item.route}
                onPress={() => {
                  router.push(item.route as any);
                  setSidebarOpen(false);
                }}
                className="flex-row items-center px-5 py-4"
                style={{ backgroundColor: active ? activeBgColor : 'transparent' }}
              >
                <Feather
                  name={item.icon}
                  size={20}
                  color={active ? activeTextColor : '#64748B'}
                />
                <Text
                  className="ml-3 text-base"
                  style={{ color: active ? activeTextColor : '#334155', fontWeight: active ? '600' : '400' }}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {sidebarOpen && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setSidebarOpen(false)}
          className="absolute inset-0 z-30 bg-black/25"
          style={{ left: 260 }}
        />
      )}

      <View className="flex-1">
        <Slot />
      </View>
    </View>
  );
}
