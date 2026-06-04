import { Tabs } from "@mantine/core";

import { PageHeader } from "../../components/ui/PageHeader";
import { ChecklistTemplatesManager } from "./ChecklistTemplatesManager";
import { LookupManager } from "./LookupManager";
import {
  useCategoryList,
  useDeleteCategory,
  useDeleteType,
  useSaveCategory,
  useSaveType,
  useTypeList,
} from "./api";

function CategoriesTab() {
  const list = useCategoryList();
  return (
    <LookupManager
      items={list.data ?? []}
      loading={list.isLoading}
      save={useSaveCategory()}
      remove={useDeleteCategory()}
      itemLabel="Categoría"
    />
  );
}

function TypesTab() {
  const list = useTypeList();
  return (
    <LookupManager
      items={list.data ?? []}
      loading={list.isLoading}
      save={useSaveType()}
      remove={useDeleteType()}
      itemLabel="Tipo de equipo"
    />
  );
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Configuración" />
      <Tabs defaultValue="categories">
        <Tabs.List mb="md">
          <Tabs.Tab value="categories">Categorías de inventario</Tabs.Tab>
          <Tabs.Tab value="types">Tipos de equipo</Tabs.Tab>
          <Tabs.Tab value="checklists">Plantillas de checklist</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="categories">
          <CategoriesTab />
        </Tabs.Panel>
        <Tabs.Panel value="types">
          <TypesTab />
        </Tabs.Panel>
        <Tabs.Panel value="checklists">
          <ChecklistTemplatesManager />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
