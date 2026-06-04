import { useRoute } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { colors } from "../../theme";
import { formatDate } from "../../utils/format";
import type { OrderChecklistRoute } from "../../navigation/types";
import {
  useDeletePhoto,
  useOrderPhotos,
  useUploadPhoto,
  type PickedImage,
} from "./photos";

export function PhotosScreen() {
  const route = useRoute<OrderChecklistRoute>();
  const { id: orderId } = route.params;
  const photos = useOrderPhotos(orderId);
  const upload = useUploadPhoto(orderId);
  const remove = useDeletePhoto(orderId);

  const doUpload = (asset: ImagePicker.ImagePickerAsset) => {
    const picked: PickedImage = {
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
    };
    upload.mutate(picked, {
      onError: (e) => Alert.alert("Error", (e as Error).message),
    });
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permiso", "Se necesita acceso a la cámara.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!res.canceled && res.assets[0]) doUpload(res.assets[0]);
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      mediaTypes: ["images"],
    });
    if (!res.canceled && res.assets[0]) doUpload(res.assets[0]);
  };

  const confirmDelete = (photoId: number) =>
    Alert.alert("Eliminar foto", "¿Eliminar esta foto?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () =>
          remove.mutate(photoId, {
            onError: (e) => Alert.alert("Error", (e as Error).message),
          }),
      },
    ]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.btn} onPress={takePhoto} disabled={upload.isPending}>
          <Text style={styles.btnText}>📷 Tomar foto</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnOutline} onPress={pickPhoto} disabled={upload.isPending}>
          <Text style={styles.btnOutlineText}>Galería</Text>
        </TouchableOpacity>
      </View>

      {upload.isPending ? (
        <View style={styles.uploading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.uploadingText}>Subiendo…</Text>
        </View>
      ) : null}

      {photos.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (photos.data ?? []).length === 0 ? (
        <Text style={styles.empty}>Aún no hay fotos.</Text>
      ) : (
        <View style={styles.grid}>
          {(photos.data ?? []).map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.thumbWrap}
              onLongPress={() => confirmDelete(p.id)}
              delayLongPress={350}
            >
              <Image source={{ uri: p.image }} style={styles.thumb} />
              <Text style={styles.thumbDate}>{formatDate(p.created_at)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {(photos.data ?? []).length > 0 ? (
        <Text style={styles.hint}>Mantén pulsada una foto para eliminarla.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  actions: { flexDirection: "row", gap: 10, marginBottom: 16 },
  btn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnOutline: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnOutlineText: { color: colors.primary, fontWeight: "700", fontSize: 15 },
  uploading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  uploadingText: { color: colors.dimmed },
  empty: { textAlign: "center", color: colors.dimmed, marginTop: 32 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  thumbWrap: { width: "31%" },
  thumb: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: colors.border,
  },
  thumbDate: { fontSize: 11, color: colors.dimmed, marginTop: 4, textAlign: "center" },
  hint: { color: colors.dimmed, fontSize: 12, marginTop: 12, fontStyle: "italic", textAlign: "center" },
});
