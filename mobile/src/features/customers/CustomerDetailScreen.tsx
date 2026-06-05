import { useRoute, type RouteProp } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import { Badge, Card, ErrorState, Field, Loading } from "../../components/ui";
import { colors } from "../../theme";
import type { MoreStackParamList } from "../../navigation/types";
import { CUSTOMER_TYPE_LABEL, useCustomer } from "./api";

export function CustomerDetailScreen() {
  const { params } = useRoute<RouteProp<MoreStackParamList, "CustomerDetail">>();
  const { data: c, isLoading, error } = useCustomer(params.id);

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
    </Screen>
  );
}
