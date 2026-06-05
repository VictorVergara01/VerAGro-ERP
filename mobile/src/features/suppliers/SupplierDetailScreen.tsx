import { useRoute, type RouteProp } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import { Badge, Card, ErrorState, Field, Loading } from "../../components/ui";
import { colors } from "../../theme";
import type { MoreStackParamList } from "../../navigation/types";
import { useSupplier } from "./api";

export function SupplierDetailScreen() {
  const { params } = useRoute<RouteProp<MoreStackParamList, "SupplierDetail">>();
  const { data: s, isLoading, error } = useSupplier(params.id);

  if (isLoading) return <Loading />;
  if (error || !s) return <Screen><ErrorState text="No se pudo cargar el proveedor." /></Screen>;

  return (
    <Screen scroll>
      <Card>
        <Badge
          label={s.is_active ? "Activo" : "Inactivo"}
          color={s.is_active ? colors.primary : colors.dimmed}
        />
        <Field label="Razón social" value={s.legal_name} />
        <Field label="País" value={s.country} />
        <Field label="Contacto" value={s.contact_person} />
        <Field label="Teléfono" value={s.phone} />
        <Field label="Correo" value={s.email} />
        <Field label="Días de entrega" value={s.estimated_delivery_days} />
        <Field label="Términos de pago" value={s.payment_terms} />
      </Card>
    </Screen>
  );
}
