import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, API_BASE_URL } from "../../lib/api/client";
import { getAccess } from "../../lib/auth/tokens";
import type { Paginated, Schemas } from "../../lib/api/types";

export type ProductCategory = Schemas["ProductCategory"];
export type EquipmentType = Schemas["EquipmentType"];
export type ChecklistTemplate = Schemas["ChecklistTemplate"];
export type CompanyProfile = Schemas["CompanyProfile"];

// ---------- Categorías de inventario ----------

export function useCategoryList() {
  return useQuery({
    queryKey: ["settings", "categories"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/inventory/categories/");
      if (error || !data) throw new Error("No se pudieron cargar las categorías.");
      return data as unknown as ProductCategory[];
    },
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id?: number;
      name: string;
      default_margin_percentage?: string;
    }) => {
      const body = {
        name: payload.name,
        ...(payload.default_margin_percentage !== undefined
          ? { default_margin_percentage: payload.default_margin_percentage }
          : {}),
      } as ProductCategory;
      if (payload.id) {
        const { error } = await api.PATCH("/api/inventory/categories/{id}/", {
          params: { path: { id: payload.id } },
          body,
        });
        if (error) throw new Error("No se pudo guardar.");
      } else {
        const { error } = await api.POST("/api/inventory/categories/", { body });
        if (error) throw new Error("No se pudo crear.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "categories"] });
      void qc.invalidateQueries({ queryKey: ["product-categories"] });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/inventory/categories/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "categories"] });
      void qc.invalidateQueries({ queryKey: ["product-categories"] });
    },
  });
}

// ---------- Tipos de equipo ----------

export function useTypeList() {
  return useQuery({
    queryKey: ["settings", "equipment-types"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/equipment/types/");
      if (error || !data) throw new Error("No se pudieron cargar los tipos.");
      return data as unknown as EquipmentType[];
    },
  });
}

export function useSaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id?: number; name: string }) => {
      if (payload.id) {
        const { error } = await api.PATCH("/api/equipment/types/{id}/", {
          params: { path: { id: payload.id } },
          body: { name: payload.name } as EquipmentType,
        });
        if (error) throw new Error("No se pudo guardar.");
      } else {
        const { error } = await api.POST("/api/equipment/types/", {
          body: { name: payload.name } as EquipmentType,
        });
        if (error) throw new Error("No se pudo crear.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "equipment-types"] });
      void qc.invalidateQueries({ queryKey: ["equipment-types"] });
    },
  });
}

export function useDeleteType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/equipment/types/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "equipment-types"] });
      void qc.invalidateQueries({ queryKey: ["equipment-types"] });
    },
  });
}

// ---------- Plantillas de checklist ----------

export function useTemplateList() {
  return useQuery({
    queryKey: ["settings", "checklist-templates"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/checklists/templates/");
      if (error || !data) throw new Error("No se pudieron cargar las plantillas.");
      return (data as unknown as Paginated<ChecklistTemplate>).results;
    },
  });
}

export interface NewTemplate {
  name: string;
  equipment_type?: number | null;
  description?: string;
  items: { name: string; order: number; is_required: boolean }[];
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewTemplate) => {
      const { error } = await api.POST("/api/checklists/templates/", {
        body: input as unknown as ChecklistTemplate,
      });
      if (error) throw new Error("No se pudo crear la plantilla.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "checklist-templates"] });
      void qc.invalidateQueries({ queryKey: ["checklist-templates"] });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/checklists/templates/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "checklist-templates"] });
      void qc.invalidateQueries({ queryKey: ["checklist-templates"] });
    },
  });
}

// ---------- Perfil de empresa (encabezado de factura) ----------

export function useCompany() {
  return useQuery({
    queryKey: ["settings", "company"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/company/");
      if (error || !data) throw new Error("No se pudo cargar la empresa.");
      return data as unknown as CompanyProfile;
    },
  });
}

export interface CompanyInput {
  name: string;
  legal_name?: string;
  tax_id?: string;
  address?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  invoice_footer?: string;
  logo?: File | null;
}

export function useSaveCompany() {
  const qc = useQueryClient();
  return useMutation({
    // Multipart: permite enviar el logo junto a los campos de texto.
    mutationFn: async (input: CompanyInput) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(input)) {
        if (key === "logo") continue;
        form.append(key, value == null ? "" : String(value));
      }
      if (input.logo instanceof File) {
        form.append("logo", input.logo);
      }
      const token = getAccess();
      const res = await fetch(`${API_BASE_URL}/api/company/`, {
        method: "PATCH",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? "Solo un administrador puede editar la empresa."
            : "No se pudo guardar la empresa.",
        );
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "company"] });
    },
  });
}

// ---------- Usuarios (gestión) ----------

export type UserAccount = Schemas["UserManagement"];

export interface UserInput {
  id?: number;
  email: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  password?: string;
}

function userErrorMessage(error: unknown, fallback: string): string {
  const body = error as Record<string, unknown> | undefined;
  if (body && typeof body === "object") {
    if (typeof body.detail === "string") return body.detail;
    const first = Object.values(body)[0];
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
    if (typeof first === "string") return first;
  }
  return fallback;
}

export function useUsers(params: { search?: string; includeInactive?: boolean }) {
  return useQuery({
    queryKey: ["settings", "users", params.search ?? "", params.includeInactive ?? false],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/user-management/", {
        params: { query: { search: params.search || undefined } },
      });
      if (error || !data) throw new Error("No se pudieron cargar los usuarios.");
      const results = (data as unknown as Paginated<UserAccount>).results;
      return params.includeInactive ? results : results.filter((u) => u.is_active);
    },
  });
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UserInput) => {
      const { id, password, ...rest } = input;
      const body = { ...rest, ...(password ? { password } : {}) } as never;
      if (id) {
        const { error } = await api.PATCH("/api/user-management/{id}/", {
          params: { path: { id } },
          body,
        });
        if (error) throw new Error(userErrorMessage(error, "No se pudo guardar el usuario."));
      } else {
        const { error } = await api.POST("/api/user-management/", { body });
        if (error) throw new Error(userErrorMessage(error, "No se pudo crear el usuario."));
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "users"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/user-management/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error(userErrorMessage(error, "No se pudo desactivar el usuario."));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "users"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
