import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { api } from "../../lib/api/client";

let currentToken: string | null = null;

export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return; // los emuladores no entregan push
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return;

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    currentToken = tokenResponse.data;
    await api.POST("/api/push/register/", { body: { token: currentToken } as never });
  } catch {
    // El push es best-effort; un fallo no debe romper la sesión.
  }
}

export async function unregisterPush(): Promise<void> {
  if (!currentToken) return;
  try {
    await api.DELETE("/api/push/unregister/", { body: { token: currentToken } as never });
  } catch {
    // ignorar
  } finally {
    currentToken = null;
  }
}
