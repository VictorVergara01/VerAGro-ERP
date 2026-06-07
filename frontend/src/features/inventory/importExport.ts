import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authedFetch } from "../../lib/api/client";

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

/** Descarga el catálogo como CSV (fetch autenticado con refresh → blob). */
export async function downloadProductsCsv(): Promise<void> {
  const res = await authedFetch("/api/inventory/products/export/");
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

/** Sube un CSV y devuelve el resumen. Multipart (FormData) con Bearer + refresh. */
export function useImportProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authedFetch("/api/inventory/products/import/", {
        method: "POST",
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
