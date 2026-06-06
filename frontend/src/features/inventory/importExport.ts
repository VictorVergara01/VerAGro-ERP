import { useMutation, useQueryClient } from "@tanstack/react-query";

import { API_BASE_URL } from "../../lib/api/client";
import { getAccess } from "../../lib/auth/tokens";

export interface ImportError {
  fila: number;
  sku: string;
  motivo: string;
}
export interface ImportResult {
  creados: number;
  saltados: number;
  errores: ImportError[];
}

/** Descarga el catálogo como CSV (fetch autenticado → blob). */
export async function downloadProductsCsv(): Promise<void> {
  const token = getAccess();
  const res = await fetch(`${API_BASE_URL}/api/inventory/products/export/`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("No se pudo exportar el inventario.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inventario.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Sube un CSV y devuelve el resumen. Usa fetch+FormData (multipart) con Bearer. */
export function useImportProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const token = getAccess();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE_URL}/api/inventory/products/import/`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error("No se pudo importar el archivo.");
      return (await res.json()) as ImportResult;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
