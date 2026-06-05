import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { API_BASE_URL } from "../../lib/api/baseUrl";
import { getAccess } from "../../lib/auth/tokens";

/** Descarga (autenticada) el PDF del documento y abre la hoja de compartir del sistema. */
export async function shareDocumentPdf({
  path,
  filename,
}: {
  path: string; // p.ej. "/api/invoices/12/pdf/"
  filename: string; // p.ej. "FAC-000012.pdf"
}) {
  try {
    const token = await getAccess();
    const url = `${API_BASE_URL}${path}?download=1`;
    const target = `${FileSystem.cacheDirectory}${filename}`;
    const res = await FileSystem.downloadAsync(url, target, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.status !== 200) {
      Alert.alert("PDF", "No se pudo descargar el documento.");
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("PDF", `Descargado en:\n${res.uri}`);
      return;
    }
    await Sharing.shareAsync(res.uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: filename,
    });
  } catch (e) {
    Alert.alert("PDF", (e as Error).message ?? "No se pudo compartir el documento.");
  }
}
