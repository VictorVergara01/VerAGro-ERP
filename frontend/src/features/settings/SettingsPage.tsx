import { Tabs } from "@mantine/core";

import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../auth/useAuth";
import { isAdmin } from "../auth/roles";
import { ChecklistTemplatesManager } from "./ChecklistTemplatesManager";
import { CompanySettings } from "./CompanySettings";
import { LookupManager } from "./LookupManager";
import { UsersManager } from "./UsersManager";
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
      withMargin
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
  const { user } = useAuth();
  const showUsers = isAdmin(user?.role);

  return (
    <>
      <PageHeader title="Configuración" />
      <Tabs defaultValue="company">
        <Tabs.List mb="md">
          <Tabs.Tab value="company">Empresa</Tabs.Tab>
          <Tabs.Tab value="categories">Categorías de inventario</Tabs.Tab>
          <Tabs.Tab value="types">Tipos de equipo</Tabs.Tab>
          <Tabs.Tab value="checklists">Plantillas de checklist</Tabs.Tab>
          {showUsers && <Tabs.Tab value="users">Usuarios</Tabs.Tab>}
        </Tabs.List>
        <Tabs.Panel value="company">
          <CompanySettings />
        </Tabs.Panel>
        <Tabs.Panel value="categories">
          <CategoriesTab />
        </Tabs.Panel>
        <Tabs.Panel value="types">
          <TypesTab />
        </Tabs.Panel>
        <Tabs.Panel value="checklists">
          <ChecklistTemplatesManager />
        </Tabs.Panel>
        {showUsers && (
          <Tabs.Panel value="users">
            <UsersManager />
          </Tabs.Panel>
        )}
      </Tabs>
    </>
  );
}
