import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import { fetchDocumentsFromAdmin, getSignedDocumentUrl } from '../../lib/api';
import { ErrorBanner } from '../../components/ErrorBanner';
import { LoadingScreen } from '../../components/LoadingScreen';

type Doc = {
  id: string;
  title: string;
  storage_path: string;
  assigned_at?: string;
  created_at?: string;
};

function normalize(row: Record<string, unknown>): Doc {
  return {
    id: String(row.id),
    title: String(row.file_name ?? row.title ?? 'Document'),
    storage_path: String(row.storage_path),
    assigned_at: row.assigned_at as string | undefined,
    created_at: row.created_at as string | undefined,
  };
}

export default function DocumentsScreen() {
  const { user } = useAuth();
  const teacherId = user!.id;
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    const { data, error: err } = await fetchDocumentsFromAdmin(teacherId);
    if (err) setError(err.message);
    else setDocs(((data as Record<string, unknown>[]) ?? []).map(normalize));
  }, [teacherId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function openDocument(doc: Doc) {
    setOpeningId(doc.id);
    const { url, error: urlErr } = await getSignedDocumentUrl(doc.storage_path);
    setOpeningId(null);
    if (urlErr || !url) {
      setError(urlErr?.message ?? 'Could not open document');
      return;
    }
    await Linking.openURL(url);
  }

  if (loading) return <LoadingScreen label="Loading documents…" />;

  return (
    <View className="flex-1 bg-slate-50">
      <View className="border-b border-slate-200 bg-white px-4 py-3">
        <Text className="text-center text-sm text-slate-600">
          Documents shared by your administrator (view only)
        </Text>
      </View>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <FlatList
        data={docs}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text className="p-8 text-center text-slate-500">No documents assigned yet.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openDocument(item)}
            className="flex-row items-center border-b border-slate-100 bg-white px-4 py-4"
          >
            <View className="flex-1">
              <Text className="font-medium text-slate-900">{item.title}</Text>
              <Text className="mt-1 text-xs text-slate-500">
                {new Date(item.assigned_at ?? item.created_at ?? '').toLocaleDateString()}
              </Text>
            </View>
            {openingId === item.id ? <ActivityIndicator /> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
