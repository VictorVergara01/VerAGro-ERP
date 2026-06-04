import Constants from "expo-constants";
import { Platform } from "react-native";

const BACKEND_PORT = 8000;
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];
// En el emulador de Android, la máquina anfitriona se alcanza por 10.0.2.2.
const ANDROID_EMULATOR_HOST = "10.0.2.2";

/**
 * URL base del backend. El dispositivo/emulador no resuelve "localhost" como la
 * PC, así que derivamos la IP del dev desde el host de Metro/Expo (puerto 8000).
 * En emulador Android, localhost → 10.0.2.2. Se puede forzar con EXPO_PUBLIC_API_URL.
 */
export function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;

  // hostUri ~ "192.168.1.100:8081" → usamos esa IP del dev con el puerto del backend.
  const host = Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
  const resolved =
    Platform.OS === "android" && LOCAL_HOSTS.includes(host)
      ? ANDROID_EMULATOR_HOST
      : host;
  return `http://${resolved}:${BACKEND_PORT}`;
}

export const API_BASE_URL = resolveBaseUrl();
