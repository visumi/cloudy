export type AccessRole = "owner" | "member";
export const INTEGRATIONS_CATEGORY_ID = "__integrations__";

export interface MeResponse {
  uid: string;
  email: string;
  name: string | null;
  picture: string | null;
  allowed: boolean;
  role: AccessRole | null;
}

export interface ItemPreview {
  title: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
}

export interface CategoryRef {
  id: string;
  name: string;
  color: string;
}

export interface CategoryRecentItem {
  id: string;
  name: string;
  imageUrl: string | null;
  faviconUrl: string | null;
  createdAt: string;
}

export interface CategorySummary extends CategoryRef {
  itemCount: number;
  recentItems: CategoryRecentItem[];
  isVirtual?: boolean;
  isSystem?: boolean;
}

export interface CategoriesResponse {
  categories: CategorySummary[];
}

export interface CloudyItem {
  id: string;
  name: string;
  url: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  observation: string | null;
  category: CategoryRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemsResponse {
  items: CloudyItem[];
}
