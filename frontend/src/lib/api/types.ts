import type { components } from "./schema";

/** Atajo a los esquemas generados del OpenAPI. */
export type Schemas = components["schemas"];

/** Envoltura de paginación de DRF (PageNumberPagination). */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const PAGE_SIZE = 25;
