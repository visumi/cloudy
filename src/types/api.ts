export type AccessRole = "owner" | "member";

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

export interface CategorySummary {
  id: string;
  name: string;
  color: string;
  itemCount?: number;
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
  category: CategorySummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemsResponse {
  items: CloudyItem[];
}
