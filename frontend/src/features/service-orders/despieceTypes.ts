export interface PartComponent {
  id: number;
  code: string;
  name: string;
  path: string;
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
  component: PartComponent;
}

export interface CompatibleProductsResponse {
  equipment_model: { id: number; name: string };
  // null cuando se piden todas las piezas del modelo (sin ?component=).
  component: { id: number; name: string; path: string } | null;
  products: CompatibleProduct[];
}
