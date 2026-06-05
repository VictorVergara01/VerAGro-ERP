import { useEffect, useState } from "react";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import { Badge, Card, ErrorState, Field, Loading } from "../../components/ui";
import { useTheme } from "../../theme";
import type { MoreNav, MoreStackParamList } from "../../navigation/types";
import { CUSTOMER_TYPE_LABEL, useCustomer } from "./api";
import { CustomerFormModal } from "./CustomerFormModal";

export function CustomerDetailScreen() {
  const { params } = useRoute<RouteProp<MoreStackParamList, "CustomerDetail">>();
  const nav = useNavigation<MoreNav>();
  const { data: c, isLoading, error } = useCustomer(params.id);
  const [edit, setEdit] = useState(false);
  const { colors } = useTheme();

  useEffect(() => {
    nav.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => setEdit(true)} hitSlop={10}>
          <Ionicons name="create-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [nav]);

  if (isLoading) return <Loading />;
  if (error || !c) return <Screen><ErrorState text="No se pudo cargar el cliente." /></Screen>;

  return (
    <Screen scroll>
      <Card>
        <Badge
          label={c.is_active ? "Activo" : "Inactivo"}
          color={c.is_active ? colors.primary : colors.dimmed}
        />
        <Field label="Tipo" value={CUSTOMER_TYPE_LABEL[c.customer_type ?? "person"]} />
        <Field label="Razón social" value={c.legal_name} />
        <Field label="Identificación" value={c.identification_number} />
        <Field label="Teléfono" value={c.phone} />
        <Field label="WhatsApp" value={c.whatsapp} />
        <Field label="Correo" value={c.email} />
        <Field label="Provincia" value={c.province} />
        <Field label="Distrito" value={c.district} />
        <Field label="Dirección" value={c.address} />
      </Card>
      <CustomerFormModal visible={edit} onClose={() => setEdit(false)} customer={c} />
    </Screen>
  );
}
