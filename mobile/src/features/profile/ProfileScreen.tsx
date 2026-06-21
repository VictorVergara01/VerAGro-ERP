import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";

import { Button, Card, LabeledInput, SectionTitle } from "../../components/ui";
import { useTheme, useThemedStyles, type ThemeColors } from "../../theme";
import { ROLE_LABELS } from "../auth/roles";
import { useAuth } from "../auth/useAuth";
import { useChangePassword, useUpdateName } from "./api";

export function ProfileScreen() {
  const styles = useThemedStyles(makeStyles);
  const { user, refreshUser } = useAuth();
  const updateName = useUpdateName();
  const changePassword = useChangePassword();

  const [name, setName] = useState(user?.full_name ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const saveName = () => {
    if (!name.trim()) return Alert.alert("Falta el nombre", "Escribe tu nombre.");
    updateName.mutate(name.trim(), {
      onSuccess: async () => {
        await refreshUser();
        Alert.alert("Listo", "Perfil actualizado.");
      },
      onError: (e) => Alert.alert("Error", (e as Error).message),
    });
  };

  const submitPassword = () => {
    if (!current || !next) return Alert.alert("Faltan datos", "Completa ambas contraseñas.");
    changePassword.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
          Alert.alert("Listo", "Contraseña actualizada.");
        },
        onError: (e) => Alert.alert("Error", (e as Error).message),
      },
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Rol</Text>
        <Text style={styles.value}>{ROLE_LABELS[user?.role ?? ""] ?? user?.role}</Text>
      </Card>

      <SectionTitle>Datos</SectionTitle>
      <Card>
        <LabeledInput label="Nombre completo" value={name} onChangeText={setName} />
        <Button title="Guardar" onPress={saveName} loading={updateName.isPending} style={{ marginTop: 12 }} />
      </Card>

      <SectionTitle>Cambiar contraseña</SectionTitle>
      <Card>
        <LabeledInput label="Contraseña actual" value={current} onChangeText={setCurrent} secureTextEntry />
        <LabeledInput label="Nueva contraseña" value={next} onChangeText={setNext} secureTextEntry />
        <Button title="Cambiar" onPress={submitPassword} loading={changePassword.isPending} style={{ marginTop: 12 }} />
      </Card>
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, gap: 12, paddingBottom: 32 },
    label: { fontSize: 12, fontWeight: "700", color: colors.dimmed },
    value: { fontSize: 15, color: colors.text, marginTop: 2 },
  });
