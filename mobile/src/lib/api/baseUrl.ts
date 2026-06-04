import Constants from "expo-constants";

/**
 * URL base del backend. El teléfono no resuelve "localhost", así que derivamos
 * la IP de la máquina de desarrollo desde el host de Metro/Expo y usamos el
 * puerto 8000 del backend. Se puede forzar con EXPO_PUBLIC_API_URL.
 */
export function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;

  // hostUri ~ "192.168.1.100:8081" → usamos esa IP del dev con el puerto del backend.
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:8000`;
  }
  return "http://localhost:8000";
}

export const API_BASE_URL = resolveBaseUrl();
