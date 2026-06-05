import { useEffect, useState } from "react";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import { Badge, Card, ErrorState, Field, Loading } from "../../components/ui";
import { useTheme } from "../../theme";
import { formatDate } from "../../utils/format";
import type { MoreNav, MoreStackParamList } from "../../navigation/types";
import { EQ_STATUS_COLOR, EQ_STATUS_LABEL, useEquipment } from "./api";
import { EquipmentFormModal } from "./EquipmentFormModal";

export function EquipmentDetailScreen() {
  const { params } = useRoute<RouteProp<MoreStackParamList, "EquipmentDetail">>();
  const nav = useNavigation<MoreNav>();
  const { data: e, isLoading, error } = useEquipment(params.id);
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
  if (error || !e) return <Screen><ErrorState text="No se pudo cargar el equipo." /></Screen>;

  return (
    <Screen scroll>
      <Card>
        <Badge
          label={EQ_STATUS_LABEL[e.status ?? "active"] ?? e.status ?? ""}
          color={EQ_STATUS_COLOR[e.status ?? "active"] ?? colors.dimmed}
        />
        <Field label="Tipo" value={e.equipment_type_name} />
        <Field label="Cliente" value={e.customer_name ?? "Empresa"} />
        <Field label="Marca" value={e.brand} />
        <Field label="Modelo" value={e.model} />
        <Field label="N.º de serie" value={e.serial_number} />
        <Field label="Código interno" value={e.internal_code} />
        <Field label="Compra" value={formatDate(e.purchase_date)} />
        <Field label="Vence garantía" value={formatDate(e.warranty_expiration)} />
        <Field label="Notas" value={e.notes} />
      </Card>
      <EquipmentFormModal visible={edit} onClose={() => setEdit(false)} equipment={e} />
    </Screen>
  );
}
