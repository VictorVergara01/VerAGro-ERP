export interface EquipmentModel {
  id: number;
  equipment_type: number;
  equipment_type_name?: string;
  brand: string;
  name: string;
  model_code: string;
  revision: string;
  description: string;
  diagram_type: string;
  is_active: boolean;
}

export interface EquipmentComponent {
  id: number;
  equipment_model: number;
  parent: number | null;
  code: string;
  name: string;
  component_type: string;
  diagram_key: string;
  position: string;
  sort_order: number;
  is_active: boolean;
  path: string;
}

export interface ProductCompatibility {
  id: number;
  product: number;
  equipment_model: number;
  equipment_model_name?: string;
  component: number;
  component_name?: string;
  component_code?: string;
  component_path?: string;
  is_primary: boolean;
  notes: string;
}
