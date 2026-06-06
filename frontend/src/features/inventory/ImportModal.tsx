import { Anchor, Button, FileInput, Group, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileSpreadsheet } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { ImportSummary } from "./ImportSummary";
import {
  downloadProductsCsv,
  useImportProducts,
  type ImportResult,
} from "./importExport";

export function ImportModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const importer = useImportProducts();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (opened) {
      setFile(null);
      setResult(null);
    }
  }, [opened]);

  const submit = async () => {
    if (!file) return;
    try {
      const res = await importer.mutateAsync(file);
      setResult(res);
      notifications.show({
        color: "green",
        message: `Importación: ${res.creados} creados, ${res.saltados} saltados.`,
      });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const downloadTemplate = async () => {
    try {
      await downloadProductsCsv();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Importar inventario (CSV)" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Sube un CSV para dar de alta productos nuevos. Casa por SKU; los que ya existen
          se saltan. Categoría y proveedor se crean si no existen.{" "}
          <Anchor component="button" type="button" onClick={downloadTemplate}>
            Descargar plantilla
          </Anchor>
        </Text>

        <FileInput
          label="Archivo CSV"
          placeholder="Selecciona un archivo .csv"
          accept=".csv,text/csv"
          leftSection={<IconFileSpreadsheet size={18} />}
          value={file}
          onChange={setFile}
        />

        {result && <ImportSummary result={result} />}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {result ? "Cerrar" : "Cancelar"}
          </Button>
          <Button onClick={submit} disabled={!file} loading={importer.isPending}>
            Importar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
