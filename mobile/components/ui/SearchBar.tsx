import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { SearchResult, SearchResultType } from '../../lib/types';

const LABELS: Record<SearchResultType, string> = {
  user: 'People',
  task: 'Tasks',
  group: 'Groups',
};

const ROLE_PREFIX: Record<string, string> = {
  coordinator: '/(coordinator)',
  teacher: '/(teacher)',
  student: '/(student)',
};

export function SearchBar({ userId }: { userId: string }) {
  const router = useRouter();
  const { profile } = useAuth();
  const rolePrefix = ROLE_PREFIX[profile?.role ?? 'coordinator'] ?? '/(coordinator)';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      const likeQuery = `%${q}%`;

      const [profilesRes, tasksRes, groupsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, email, role')
          .or(`display_name.ilike.${likeQuery},email.ilike.${likeQuery}`)
          .is('deleted_at', null)
          .limit(10),
        supabase
          .from('tasks')
          .select('id, title, description')
          .or(`title.ilike.${likeQuery},description.ilike.${likeQuery}`)
          .limit(5),
        supabase
          .from('groups')
          .select('id, name, description')
          .or(`name.ilike.${likeQuery},description.ilike.${likeQuery}`)
          .limit(5),
      ]);

      if (profilesRes.error) console.error('profiles search error:', profilesRes.error);
      if (tasksRes.error) console.error('tasks search error:', tasksRes.error);
      if (groupsRes.error) console.error('groups search error:', groupsRes.error);

      const combined: SearchResult[] = [];

      if (profilesRes.data) {
        for (const p of profilesRes.data) {
          combined.push({
            result_type: 'user',
            result_id: p.id,
            title: p.display_name ?? p.email ?? 'Unknown',
            subtitle: p.email ?? p.display_name ?? '',
            url_path:
              p.role === 'teacher' ? `${rolePrefix}/teachers` :
              p.role === 'student' ? `${rolePrefix}/students` :
              p.role === 'coordinator' ? `${rolePrefix}/profile` :
              `${rolePrefix}/teachers`,
          });
        }
      }

      if (tasksRes.data) {
        for (const t of tasksRes.data) {
          combined.push({
            result_type: 'task',
            result_id: t.id,
            title: t.title,
            subtitle: t.description ?? '',
            url_path: `${rolePrefix}/tasks`,
          });
        }
      }

      if (groupsRes.data) {
        for (const g of groupsRes.data) {
          combined.push({
            result_type: 'group',
            result_id: g.id,
            title: g.name,
            subtitle: g.description ?? '',
            url_path: `${rolePrefix}/groups`,
          });
        }
      }

      setResults(combined);
      setLoading(false);
    },
    [],
  );

  const onChangeText = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(text), 300);
    },
    [search],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<SearchResultType, SearchResult[]>();
    for (const r of results) {
      const arr = map.get(r.result_type) ?? [];
      arr.push(r);
      map.set(r.result_type, arr);
    }
    return Array.from(map.entries());
  }, [results]);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    inputRef.current?.blur();
    setFocused(false);
  }, []);

  const handleSelect = useCallback(
    (r: SearchResult) => {
      setQuery('');
      setResults([]);
      setFocused(false);
      inputRef.current?.blur();
      router.push(r.url_path as any);
    },
    [router],
  );

  return (
    <View className="mb-4">
      <View className="relative">
        <View className="absolute left-3 top-0 bottom-0 justify-center z-10">
          <Feather name="search" size={16} color="#94A3B8" />
        </View>
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          placeholder="Search users, tasks, groups..."
          placeholderTextColor="#94A3B8"
          className="rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-sm text-slate-900"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable
            onPress={handleClear}
            className="absolute right-2.5 top-0 bottom-0 justify-center"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={16} color="#94A3B8" />
          </Pressable>
        )}
      </View>

      {focused && (loading || results.length > 0) && (
        <View className="mt-1.5 rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading && (
            <View className="flex-row items-center justify-center gap-2 py-6">
              <ActivityIndicator size="small" color="#94A3B8" />
              <Text className="text-sm text-slate-500">Searching...</Text>
            </View>
          )}

          {!loading && results.length === 0 && query.length >= 2 && (
            <View className="py-6 items-center">
              <Text className="text-sm text-slate-500">
                No results for &ldquo;{query}&rdquo;
              </Text>
            </View>
          )}

          {!loading && results.length > 0 && (
            <View className="py-2">
              {grouped.map(([type, items]) => (
                <View key={type}>
                  <Text className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {LABELS[type]}
                  </Text>
                  {items.map((item) => (
                    <Pressable
                      key={`${item.result_type}-${item.result_id}`}
                      onPress={() => handleSelect(item)}
                      className="flex-row items-center gap-3 px-4 py-2.5 active:bg-slate-50"
                    >
                      <Feather
                        name={item.result_type === 'task' ? 'check-square' : item.result_type === 'group' ? 'users' : 'user'}
                        size={16}
                        color="#94A3B8"
                      />
                      <View className="flex-1">
                        <Text className="text-sm text-slate-900" numberOfLines={1}>
                          {item.title}
                        </Text>
                        {item.subtitle ? (
                          <Text className="text-xs text-slate-500" numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                        ) : null}
                      </View>
                      <Feather name="chevron-right" size={14} color="#CBD5E1" />
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
