import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';

/**
 * Picks a document for upload.
 *
 * `copyToCacheDirectory: false` keeps the system content URI (content:// on Android).
 * The Expo Go cache copy (file://…/DocumentPicker/…) is often not readable by
 * FileSystem.copyAsync / legacy APIs; expo-file-system `File.bytes()` reads
 * content:// via ContentResolver reliably.
 */
const PICKER_OPTIONS: DocumentPicker.DocumentPickerOptions = {
  type: ['application/pdf', 'image/*', 'text/plain'],
  copyToCacheDirectory: false,
  multiple: false,
};

export type PickedDocument = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  file?: DocumentPickerAsset['file'];
};

export async function pickDocumentForUpload(): Promise<
  { ok: true; asset: PickedDocument } | { ok: false; canceled: true } | { ok: false; error: string }
> {
  console.log('[DocumentPicker] getDocumentAsync options:', PICKER_OPTIONS);

  const result = await DocumentPicker.getDocumentAsync(PICKER_OPTIONS);

  if (result.canceled || !result.assets?.[0]) {
    console.log('[DocumentPicker] canceled');
    return { ok: false, canceled: true };
  }

  const asset = result.assets[0];

  console.log('[DocumentPicker] asset.uri:', asset.uri);
  console.log('[DocumentPicker] asset.name:', asset.name);
  console.log('[DocumentPicker] asset.mimeType:', asset.mimeType);
  console.log('[DocumentPicker] asset.size:', asset.size);
  console.log('[DocumentPicker] asset.file:', asset.file ?? '(native — no web File object)');

  if (!asset.uri) {
    return { ok: false, error: 'Document picker returned no URI.' };
  }

  return {
    ok: true,
    asset: {
      uri: asset.uri,
      name: asset.name ?? `document-${Date.now()}.pdf`,
      mimeType: asset.mimeType ?? 'application/pdf',
      size: asset.size,
      file: asset.file,
    },
  };
}
