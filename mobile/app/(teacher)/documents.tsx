import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
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
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';

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

function fileIcon(name: string): React.ComponentProps<typeof Feather>['name'] {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'file-text';
  if (/\.(png|jpg|jpeg|gif|webp)$/.test(lower)) return 'image';
  return 'file';
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
  const [search, setSearch] = useState('');

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
    setStatus('');
    setError('');

    const picked = await pickDocumentForUpload();
    if (!picked.ok) {
      if ('error' in picked && picked.error) setError(picked.error);
      return;
    }

    setUploading(true);
    setStatus('Uploading…');

    const { error: upErr } = await uploadTeacherDocumentToAdmin(teacherId, picked.asset);

    setUploading(false);

    if (upErr) {
      setError(upErr);
      setStatus('');
      return;
    }

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

  const q = search.trim().toLowerCase();
  const filterDocs = (list: Doc[]) =>
    q ? list.filter((d) => d.title.toLowerCase().includes(q)) : list;

  if (loading) return <LoadingScreen label="Loading documents…" />;

  function DocRow({ item, showDelete }: { item: Doc; showDelete?: boolean }) {
    return (
      <Pressable onPress={() => openDocument(item)} className="mb-2">
        <Card className="flex-row items-center gap-3 py-3">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent-blue-50">
            <Feather name={fileIcon(item.title)} size={20} color="#3B82F6" />
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-slate-900" numberOfLines={1}>
              {item.title}
            </Text>
            <Text className="mt-0.5 text-xs text-slate-500">
              {new Date(item.assigned_at ?? item.created_at ?? '').toLocaleString()}
            </Text>
          </View>
          {openingId === item.id ? (
            <ActivityIndicator color="#22C55E" />
          ) : (
            <Feather name="download" size={18} color="#22C55E" />
          )}
          {showDelete ? (
            <Pressable onPress={() => confirmDelete(item)} className="ml-1 p-2">
              <Feather name="trash-2" size={18} color="#DC2626" />
            </Pressable>
          ) : null}
        </Card>
      </Pressable>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <View className="border-b border-slate-100 bg-white px-4 pb-4 pt-3">
        <Text className="text-sm text-slate-600">
          View documents from admin or send files to your administrator
        </Text>
        <View className="mt-3 flex-row items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
          <Feather name="search" size={18} color="#94A3B8" />
          <TextInput
            className="ml-2 flex-1 py-2.5 text-sm text-slate-900"
            placeholder="Search documents…"
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#94A3B8"
          />
        </View>
        <Pressable
          onPress={handleSelectDocument}
          disabled={uploading}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-accent-blue-500 py-3.5 disabled:opacity-50"
        >
          <Feather name="upload" size={18} color="#fff" />
          <Text className="font-semibold text-white">
            {uploading ? 'Uploading…' : 'Upload document'}
          </Text>
        </Pressable>
        {status ? (
          <Text className="mt-2 text-center text-xs font-medium text-accent-blue-600">{status}</Text>
        ) : null}
      </View>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <FlatList
        data={filterDocs(fromAdmin)}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 pb-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22C55E" />}
        ListHeaderComponent={
          <>
            <Text className="mb-2 mt-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Sent to administrator
            </Text>
            {filterDocs(myUploads).length === 0 ? (
              <EmptyState
                icon="upload"
                title="No uploads yet"
                description="Share PDFs, images, or documents with your admin."
              />
            ) : (
              filterDocs(myUploads).map((item) => <DocRow key={item.id} item={item} showDelete />)
            )}
            <Text className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">
              From administrator
            </Text>
            {filterDocs(fromAdmin).length === 0 && filterDocs(myUploads).length === 0 && !q ? null : null}
          </>
        }
        ListEmptyComponent={
          filterDocs(fromAdmin).length === 0 && !q ? (
            <EmptyState
              icon="file-text"
              title="No documents from admin"
              description="Assigned materials will appear here."
            />
          ) : q ? (
            <Text className="py-8 text-center text-sm text-slate-500">No matches for your search.</Text>
          ) : null
        }
        renderItem={({ item }) => <DocRow item={item} />}
      />
    </View>
  );
}
