import { useQuery } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type Product = components["schemas"]["Product"];

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export function useProductSearch(search: string) {
  return useQuery({
    queryKey: ["product-search", search],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/inventory/products/", {
        params: { query: { search: search || undefined } },
      });
      if (error || !data) throw new Error("No se pudieron cargar los productos.");
      return (data as unknown as Paginated<Product>).results;
    },
  });
}
