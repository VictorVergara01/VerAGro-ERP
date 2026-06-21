import { useMutation } from "@tanstack/react-query";

import { api } from "../../lib/api/client";

export function useUpdateName() {
  return useMutation({
    mutationFn: async (full_name: string) => {
      const { error } = await api.PATCH("/api/auth/me/", {
        body: { full_name } as never,
      });
      if (error) throw new Error("No se pudo actualizar el nombre.");
    },
  });
}

function changePasswordError(error: unknown, fallback: string): string {
  const body = error as Record<string, unknown> | undefined;
  if (body && typeof body === "object") {
    if (typeof body.detail === "string") return body.detail;
    const first = Object.values(body)[0];
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
    if (typeof first === "string") return first;
  }
  return fallback;
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: { current_password: string; new_password: string }) => {
      const { error } = await api.POST("/api/auth/change-password/", {
        body: input as never,
      });
      if (error) throw new Error(changePasswordError(error, "No se pudo cambiar la contraseña."));
    },
  });
}
