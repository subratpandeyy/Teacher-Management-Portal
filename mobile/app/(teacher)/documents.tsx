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
import { pickDocumentForUpload } from '../../lib/documentPicker';
import { fetchDocuments, getSignedDocumentUrl, uploadDocument } from '../../lib/api';
import type { DocumentRow } from '../../lib/supabase';
import { ErrorBanner } from '../../components/ErrorBanner';
import { LoadingScreen } from '../../components/LoadingScreen';

export default function DocumentsScreen() {
  const { user } = useAuth();
  const teacherId = user!.id;
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    const { data, error: err } = await fetchDocuments(teacherId);
    if (err) setError(err.message);
    else setDocs((data as DocumentRow[]) ?? []);
  }, [teacherId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function pickAndUpload() {
    try {
      const picked = await pickDocumentForUpload();
      if (!picked.ok) {
        if ('canceled' in picked && picked.canceled) return;
        setError('error' in picked ? picked.error : 'Could not pick file');
        return;
      }

      const asset = picked.asset;
      setUploading(true);
      setError('');

      const { error: uploadErr } = await uploadDocument(teacherId, {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
      });

      if (uploadErr) {
        console.error('[Documents] upload failed:', uploadErr);
        setError(uploadErr);
      } else {
        console.log('[Documents] upload success');
        await load();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed unexpectedly';
      console.error('[Documents] pickAndUpload error:', err);
      setError(message);
    } finally {
      setUploading(false);
    }
  }

  async function openDocument(doc: DocumentRow) {
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
        <Pressable
          onPress={pickAndUpload}
          disabled={uploading}
          className="items-center rounded-xl bg-brand-600 py-3 disabled:opacity-60"
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="font-semibold text-white">Upload document</Text>
          )}
        </Pressable>
      </View>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <FlatList
        data={docs}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text className="p-8 text-center text-slate-500">No documents uploaded.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openDocument(item)}
            className="flex-row items-center border-b border-slate-100 bg-white px-4 py-4"
          >
            <View className="flex-1">
              <Text className="font-medium text-slate-900">{item.title}</Text>
              <Text className="mt-1 text-xs text-slate-500">
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
            {openingId === item.id ? <ActivityIndicator /> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
