export interface ComponentTreeNode {
  id: number;
  code: string;
  name: string;
  component_type: string;
  diagram_key: string;
  position: string;
  sort_order: number;
  children: ComponentTreeNode[];
}

export interface CompatibleProduct {
  id: number;
  sku: string;
  name: string;
  part_number: string;
  stock_quantity: string;
  reserved_quantity: string;
  available_quantity: string;
  sale_price: string;
  location: string;
  is_primary: boolean;
}

export interface CompatibleProductsResponse {
  equipment_model: { id: number; name: string };
  component: { id: number; name: string; path: string };
  products: CompatibleProduct[];
}
