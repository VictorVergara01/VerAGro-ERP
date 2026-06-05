import { useRoute, type RouteProp } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import { Badge, Card, ErrorState, Field, Loading } from "../../components/ui";
import { colors } from "../../theme";
import { formatDate } from "../../utils/format";
import type { MoreStackParamList } from "../../navigation/types";
import { EQ_STATUS_COLOR, EQ_STATUS_LABEL, useEquipment } from "./api";

export function EquipmentDetailScreen() {
  const { params } = useRoute<RouteProp<MoreStackParamList, "EquipmentDetail">>();
  const { data: e, isLoading, error } = useEquipment(params.id);

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
    </Screen>
  );
}
