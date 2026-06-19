import { useEffect, useState } from "react";
import { Alert, Text } from "react-native";
import * as Location from "expo-location";

import { FormModal, Picker, Segmented } from "../../components/ui/form";
import { Button, LabeledInput } from "../../components/ui";
import { formatCurrency } from "../../utils/format";
import { useCustomers } from "../customers/api";
import { useEquipmentList } from "../equipment/api";
import {
  useCompany,
  useSaveFieldJob,
  type FieldJob,
  type FieldJobInput,
} from "./api";

const JOB_TYPES = [
  { value: "fumigation", label: "Fumigación" },
  { value: "spreading", label: "Esparcido" },
];

export function FieldJobFormModal({
  visible,
  onClose,
  job,
}: {
  visible: boolean;
  onClose: () => void;
  job?: FieldJob | null;
}) {
  const save = useSaveFieldJob();
  const customers = useCustomers("");
  const equipments = useEquipmentList("");
  const company = useCompany();
  const editing = Boolean(job?.id);

  const [jobType, setJobType] = useState("fumigation");
  const [customer, setCustomer] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<number | null>(null);
  const [location, setLocation] = useState("");
  const [crop, setCrop] = useState("");
  const [appliedProduct, setAppliedProduct] = useState("");
  const [hectares, setHectares] = useState("");
  const [quintals, setQuintals] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [lat, setLat] = useState<string | null>(null);
  const [lng, setLng] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const priceFor = (t: string) => {
    const c = company.data ?? {};
    return t === "spreading"
      ? c.spreading_price_per_quintal ?? "10"
      : c.fumigation_price_per_hectare ?? "20";
  };

  useEffect(() => {
    if (visible) {
      const t = job?.job_type ?? "fumigation";
      setJobType(t);
      setCustomer(job?.customer ?? null);
      setEquipment(job?.equipment ?? null);
      setLocation(job?.location ?? "");
      setCrop(job?.crop ?? "");
      setAppliedProduct(job?.applied_product ?? "");
      setHectares(job?.hectares ?? "");
      setQuintals(job?.quintals ?? "");
      setUnitPrice(job?.unit_price ?? priceFor(t));
      setNotes(job?.notes ?? "");
      setLat(job?.latitude ?? null);
      setLng(job?.longitude ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, job]);

  const isFumigation = jobType === "fumigation";
  const liveTotal = (Number(isFumigation ? hectares : quintals) || 0) * (Number(unitPrice) || 0);

  const onTypeChange = (t: string) => {
    if (!editing && unitPrice === priceFor(jobType)) setUnitPrice(priceFor(t));
    setJobType(t);
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso denegado", "No se pudo acceder a la ubicación.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLat(String(loc.coords.latitude));
      setLng(String(loc.coords.longitude));
    } catch {
      Alert.alert("Error", "No se pudo obtener la ubicación.");
    } finally {
      setLocating(false);
    }
  };

  const submit = () => {
    if (!customer) return Alert.alert("Falta el cliente", "Selecciona un cliente.");
    const input: FieldJobInput & { id?: number } = {
      id: job?.id,
      job_type: jobType,
      customer,
      equipment,
      location,
      crop,
      applied_product: appliedProduct,
      hectares: String(hectares || 0),
      quintals: String(quintals || 0),
      unit_price: String(unitPrice || 0),
      notes,
      latitude: lat,
      longitude: lng,
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
      <Segmented label="Tipo" value={jobType} options={JOB_TYPES} onChange={onTypeChange} />
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
      <LabeledInput label="Cultivo" value={crop} onChangeText={setCrop} />
      <LabeledInput label="Producto aplicado" value={appliedProduct} onChangeText={setAppliedProduct} />
      {isFumigation ? (
        <LabeledInput label="Hectáreas" value={hectares} onChangeText={setHectares} keyboardType="decimal-pad" />
      ) : (
        <LabeledInput label="Quintales" value={quintals} onChangeText={setQuintals} keyboardType="decimal-pad" />
      )}
      <LabeledInput
        label={isFumigation ? "Precio/ha ($)" : "Precio/qq ($)"}
        value={unitPrice}
        onChangeText={setUnitPrice}
        keyboardType="decimal-pad"
      />
      <Text style={{ fontWeight: "700" }}>Total estimado: {formatCurrency(liveTotal)}</Text>

      <Button
        title={locating ? "Obteniendo…" : lat ? `📍 ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : "📍 Usar mi ubicación"}
        variant="outline"
        onPress={useMyLocation}
        disabled={locating}
      />
      <LabeledInput label="Notas" value={notes} onChangeText={setNotes} multiline />
    </FormModal>
  );
}
