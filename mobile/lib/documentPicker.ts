import { File } from 'expo-file-system';
import { UPLOAD_LOG } from '../../shared/upload';

const PICKER_MIME_TYPES = [
  'application/pdf',
  'image/*',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  '*/*',
];

export type PickedFile = {
  /** expo-file-system File (readable via arrayBuffer). */
  file: File;
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
};

/**
 * Pick a document using Expo SDK 56 File.pickFileAsync (no expo-document-picker cache URIs).
 */
export async function pickDocumentForUpload(): Promise<
  { ok: true; asset: PickedFile } | { ok: false; canceled: true } | { ok: false; error: string }
> {
  console.log(UPLOAD_LOG, 'opening file picker');

  const result = await File.pickFileAsync({
    mimeTypes: PICKER_MIME_TYPES,
  });

  if (result.canceled || !result.result) {
    console.log(UPLOAD_LOG, 'picker canceled');
    return { ok: false, canceled: true };
  }

  const file = result.result;
  const name = file.name || `document-${Date.now()}.pdf`;
  const mimeType = file.type || 'application/octet-stream';

  console.log(UPLOAD_LOG, 'file selected', {
    uri: file.uri,
    name,
    mimeType,
    size: file.size,
    exists: file.exists,
  });

  if (!file.exists) {
    return { ok: false, error: 'Selected file is not accessible. Try again.' };
  }

  return {
    ok: true,
    asset: {
      file,
      uri: file.uri,
      name,
      mimeType,
      size: file.size,
    },
  };
}
