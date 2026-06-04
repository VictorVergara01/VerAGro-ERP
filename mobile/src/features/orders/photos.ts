import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import { API_BASE_URL } from "../../lib/api/baseUrl";
import { getAccess } from "../../lib/auth/tokens";
import type { components } from "../../lib/api/schema";

export type ServiceOrderPhoto = components["schemas"]["ServiceOrderPhoto"];

interface Paginated<T> {
  count: number;
  results: T[];
}

export interface PickedImage {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

export function useOrderPhotos(orderId: number | undefined) {
  return useQuery({
    queryKey: ["order-photos", orderId],
    enabled: orderId != null,
    queryFn: async () => {
      const query = { service_order: orderId } as {
        page?: number;
        service_order?: number;
      };
      const { data, error } = await api.GET("/api/service-order-photos/", {
        params: { query },
      });
      if (error || !data) throw new Error("No se pudieron cargar las fotos.");
      return (data as unknown as Paginated<ServiceOrderPhoto>).results;
    },
  });
}

export function useUploadPhoto(orderId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (image: PickedImage) => {
      const token = await getAccess();
      const form = new FormData();
      form.append("service_order", String(orderId));
      // En RN, los archivos se adjuntan como { uri, name, type }.
      form.append("image", {
        uri: image.uri,
        name: image.fileName ?? "foto.jpg",
        type: image.mimeType ?? "image/jpeg",
      } as unknown as Blob);
      const res = await fetch(`${API_BASE_URL}/api/service-order-photos/`, {
        method: "POST",
        // No fijar Content-Type: RN añade el boundary multipart.
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      if (!res.ok) throw new Error("No se pudo subir la foto.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["order-photos", orderId] });
    },
  });
}

export function useDeletePhoto(orderId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: number) => {
      const { error } = await api.DELETE("/api/service-order-photos/{id}/", {
        params: { path: { id: photoId } },
      });
      if (error) throw new Error("No se pudo eliminar la foto.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["order-photos", orderId] });
    },
  });
}
