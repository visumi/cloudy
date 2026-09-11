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

export interface CloudyItem {
  id: string;
  name: string;
  url: string;
  imageUrl: string | null;
  faviconUrl: string | null;
  observation: string | null;
  category: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ItemsResponse {
  items: CloudyItem[];
}
