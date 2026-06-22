import { useEffect, useState } from "react";
import { Alert, Text } from "react-native";

import { AddRowButton, FormModal, LineCard, Picker, Segmented } from "../../components/ui/form";
import { LabeledInput, SectionTitle } from "../../components/ui";
import { formatCurrency } from "../../utils/format";
import { useCustomers } from "../customers/api";
import { useEquipmentList } from "../equipment/api";
import { useAuth } from "../auth/useAuth";
import {
  CROP_OPTIONS,
  PRODUCT_UNIT_OPTIONS,
  useCompany,
  useSaveFieldJob,
  type FieldJob,
  type FieldJobInput,
} from "./api";

const MAX_PRODUCTS = 10;

interface ProductRow {
  name: string;
  dose_per_hectare: string;
  unit: string;
}

export function FieldJobFormModal({
  visible,
  onClose,
  job,
}: {
  visible: boolean;
  onClose: () => void;
  job?: FieldJob | null;
}) {
  const { user } = useAuth();
  const save = useSaveFieldJob();
  const customers = useCustomers("");
  const equipments = useEquipmentList("");
  const company = useCompany();
  const editing = Boolean(job?.id);

  const [customer, setCustomer] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<number | null>(null);
  const [location, setLocation] = useState("");
  const [crop, setCrop] = useState("rice");
  const [cropOther, setCropOther] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [hectares, setHectares] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [notes, setNotes] = useState("");

  const defaultPrice = () => company.data?.fumigation_price_per_hectare ?? "20";

  useEffect(() => {
    if (visible) {
      setCustomer(job?.customer ?? null);
      setEquipment(job?.equipment ?? null);
      setLocation(job?.location ?? "");
      setCrop(job?.crop ?? "rice");
      setCropOther(job?.crop_other ?? "");
      setProducts(
        (job?.products ?? []).map((p) => ({
          name: p.name,
          dose_per_hectare: String(p.dose_per_hectare ?? ""),
          unit: p.unit ?? "L/ha",
        })),
      );
      setHectares(job?.hectares ?? "1");
      setUnitPrice(job?.unit_price ?? defaultPrice());
      setNotes(job?.notes ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, job]);

  const liveTotal = (Number(hectares) || 0) * (Number(unitPrice) || 0);

  const setProductRow = (i: number, patch: Partial<ProductRow>) =>
    setProducts((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addProduct = () => setProducts((ps) => [...ps, { name: "", dose_per_hectare: "", unit: "L/ha" }]);
  const removeProduct = (i: number) => setProducts((ps) => ps.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!customer) return Alert.alert("Falta el cliente", "Selecciona un cliente.");
    const input: FieldJobInput & { id?: number } = {
      id: job?.id,
      job_type: "fumigation",
      customer,
      equipment,
      technician: job?.technician ?? user?.id ?? null,
      location,
      crop,
      crop_other: crop === "other" ? cropOther : "",
      products: products
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name.trim(), dose_per_hectare: String(Number(p.dose_per_hectare) || 0), unit: p.unit })),
      hectares: String(hectares || 0),
      unit_price: String(unitPrice || 0),
      notes,
    };
    save.mutate(input, {
      onSuccess: onClose,
      onError: (e) => Alert.alert("Error", (e as Error).message),
    });
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={editing ? "Editar trabajo" : "Nuevo trabajo"}
      onSubmit={submit}
      submitting={save.isPending}
      submitLabel="Guardar"
    >
      <Picker
        label="Cliente"
        value={customer}
        onChange={(v) => setCustomer(v as number | null)}
        options={(customers.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
      />
      <Picker
        label="Dron"
        value={equipment}
        onChange={(v) => setEquipment(v as number | null)}
        options={(equipments.data ?? []).map((e) => ({ value: e.id, label: e.name }))}
        clearable
        placeholder="Sin asignar"
      />
      <LabeledInput label="Finca / Ubicación" value={location} onChangeText={setLocation} />
      <Segmented label="Cultivo" value={crop} options={CROP_OPTIONS} onChange={setCrop} />
      {crop === "other" && (
        <LabeledInput label="Especifica el cultivo" value={cropOther} onChangeText={setCropOther} />
      )}

      <SectionTitle>Químicos (dosis por hectárea)</SectionTitle>
      {products.map((p, i) => (
        <LineCard key={i} title={`Químico ${i + 1}`} onRemove={() => removeProduct(i)}>
          <LabeledInput label="Nombre" value={p.name} onChangeText={(v) => setProductRow(i, { name: v })} />
          <LabeledInput
            label="Dosis por hectárea"
            value={p.dose_per_hectare}
            onChangeText={(v) => setProductRow(i, { dose_per_hectare: v })}
            keyboardType="decimal-pad"
          />
          <Segmented
            label="Unidad"
            value={p.unit}
            options={PRODUCT_UNIT_OPTIONS}
            onChange={(v) => setProductRow(i, { unit: v })}
          />
        </LineCard>
      ))}
      {products.length < MAX_PRODUCTS ? (
        <AddRowButton label="Agregar químico" onPress={addProduct} />
      ) : (
        <Text style={{ color: "#888", marginTop: 8 }}>Máximo {MAX_PRODUCTS} químicos por trabajo.</Text>
      )}

      <LabeledInput label="Hectáreas" value={hectares} onChangeText={setHectares} keyboardType="decimal-pad" />
      <LabeledInput label="Precio/ha ($)" value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" />
      <Text style={{ fontWeight: "700" }}>Total estimado: {formatCurrency(liveTotal)}</Text>

      <LabeledInput label="Notas" value={notes} onChangeText={setNotes} multiline />
    </FormModal>
  );
}
