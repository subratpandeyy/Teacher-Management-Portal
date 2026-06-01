import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import {
  deleteTeacherDocument,
  fetchDocumentsFromAdmin,
  fetchMyUploadsToAdmin,
  openAssignedDocument,
  uploadTeacherDocumentToAdmin,
} from '../../lib/api';
import { pickDocumentForUpload } from '../../lib/documentPicker';
import { ErrorBanner } from '../../components/ErrorBanner';
import { LoadingScreen } from '../../components/LoadingScreen';

type Doc = {
  id: string;
  title: string;
  storage_path: string;
  storage_bucket?: string | null;
  assigned_at?: string;
  created_at?: string;
};

function normalize(row: Record<string, unknown>): Doc {
  return {
    id: String(row.id),
    title: String(row.file_name ?? row.title ?? 'Document'),
    storage_path: String(row.storage_path),
    storage_bucket: (row.storage_bucket as string | null) ?? null,
    assigned_at: row.assigned_at as string | undefined,
    created_at: row.created_at as string | undefined,
  };
}

export default function DocumentsScreen() {
  const { user } = useAuth();
  const teacherId = user!.id;
  const [fromAdmin, setFromAdmin] = useState<Doc[]>([]);
  const [myUploads, setMyUploads] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    const [assigned, mine] = await Promise.all([
      fetchDocumentsFromAdmin(teacherId),
      fetchMyUploadsToAdmin(teacherId),
    ]);
    if (assigned.error) setError(assigned.error.message);
    else setFromAdmin(((assigned.data as Record<string, unknown>[]) ?? []).map(normalize));

    if (mine.error) setError(mine.error.message);
    else setMyUploads(((mine.data as Record<string, unknown>[]) ?? []).map(normalize));
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
    const { error: urlErr } = await openAssignedDocument({
      storage_path: doc.storage_path,
      storage_bucket: doc.storage_bucket,
    });
    setOpeningId(null);
    if (urlErr) setError(urlErr.message ?? 'Could not open document');
  }

  async function handleSelectDocument() {
    console.log('[documents] Select Document pressed');
    setStatus('');
    setError('');

    const picked = await pickDocumentForUpload();
    if (!picked.ok) {
      if ('error' in picked && picked.error) setError(picked.error);
      return;
    }

    console.log('[documents] file selected', picked.asset.name);
    setUploading(true);
    setStatus('Uploading…');

    const { error: upErr } = await uploadTeacherDocumentToAdmin(teacherId, picked.asset);

    setUploading(false);

    if (upErr) {
      setError(upErr);
      setStatus('');
      return;
    }

    console.log('[documents] upload complete');
    setStatus('Document sent to administrator.');
    await load();
  }

  function confirmDelete(doc: Doc) {
    Alert.alert('Delete document?', `Remove "${doc.title}" from admin?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error: delErr } = await deleteTeacherDocument(teacherId, doc.id);
          if (delErr) setError(delErr);
          else await load();
        },
      },
    ]);
  }

  if (loading) return <LoadingScreen label="Loading documents…" />;

  return (
    <View className="flex-1 bg-slate-50">
      <View className="border-b border-slate-200 bg-white px-4 py-3">
        <Text className="text-center text-sm text-slate-600">
          View documents from admin or send files to your administrator
        </Text>
        <Pressable
          onPress={handleSelectDocument}
          disabled={uploading}
          className="mt-3 items-center rounded-xl bg-brand-600 py-3 disabled:opacity-50"
        >
          <Text className="font-semibold text-white">
            {uploading ? 'Uploading…' : 'Select document'}
          </Text>
        </Pressable>
        {status ? <Text className="mt-2 text-center text-xs text-green-700">{status}</Text> : null}
      </View>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <FlatList
        data={fromAdmin}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            <Text className="px-4 pb-2 pt-3 text-xs font-semibold uppercase text-slate-500">
              Sent to administrator
            </Text>
            {myUploads.length === 0 ? (
              <Text className="px-4 pb-4 text-sm text-slate-500">No uploads yet.</Text>
            ) : (
              myUploads.map((item) => (
                <View
                  key={item.id}
                  className="flex-row items-center border-b border-slate-100 bg-white px-4 py-4"
                >
                  <Pressable className="flex-1" onPress={() => openDocument(item)}>
                    <Text className="font-medium text-slate-900">{item.title}</Text>
                    <Text className="mt-1 text-xs text-slate-500">
                      {new Date(item.created_at ?? '').toLocaleString()}
                    </Text>
                  </Pressable>
                  {openingId === item.id ? <ActivityIndicator /> : null}
                  <Pressable onPress={() => confirmDelete(item)} className="ml-3 px-2 py-1">
                    <Text className="text-sm text-red-600">Delete</Text>
                  </Pressable>
                </View>
              ))
            )}
            <Text className="px-4 pb-2 pt-4 text-xs font-semibold uppercase text-slate-500">
              From administrator
            </Text>
            {fromAdmin.length === 0 ? (
              <Text className="px-4 pb-8 text-sm text-slate-500">No documents from admin yet.</Text>
            ) : null}
          </>
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
