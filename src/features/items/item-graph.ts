import type { CloudyItem } from "../../types/api";

export interface GraphCluster {
  categoryId: string;
  categoryName: string;
  left: number;
  top: number;
}

export interface GraphNode {
  item: CloudyItem;
  left: number;
  top: number;
  categoryLeft: number;
  categoryTop: number;
}

export interface ItemGraphLayout {
  clusters: GraphCluster[];
  nodes: GraphNode[];
}

const UNTAGGED_CATEGORY_ID = "__untagged__";

export function buildItemGraphLayout(items: CloudyItem[]): ItemGraphLayout {
  const grouped = new Map<string, CloudyItem[]>();
  for (const item of items) {
    const groupKey = item.category?.id ?? UNTAGGED_CATEGORY_ID;
    const group = grouped.get(groupKey) || [];
    group.push(item);
    grouped.set(groupKey, group);
  }

  const categories = [...grouped.entries()].sort(([, first], [, second]) => getCategoryName(first[0]).localeCompare(getCategoryName(second[0]), "pt-BR"));
  const clusters: GraphCluster[] = [];
  const nodes: GraphNode[] = [];

  categories.forEach(([categoryId, categoryItems], categoryIndex) => {
    const angle = -Math.PI / 2 + (categoryIndex * Math.PI * 2) / Math.max(categories.length, 1);
    const clusterLeft = clamp(50 + Math.cos(angle) * (categories.length === 1 ? 0 : 31), 14, 86);
    const clusterTop = clamp(48 + Math.sin(angle) * (categories.length === 1 ? 25 : 27), 16, 80);
    const cluster = { categoryId, categoryName: getCategoryName(categoryItems[0]), left: clusterLeft, top: clusterTop };
    clusters.push(cluster);

    const orderedItems = [...categoryItems].sort((first, second) => first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id));
    orderedItems.forEach((item, itemIndex) => {
      const ring = orderedItems.length === 1 ? 0 : 9 + Math.floor(itemIndex / 6) * 6;
      const itemAngle = orderedItems.length === 1 ? 0 : (itemIndex * Math.PI * 2) / Math.min(orderedItems.length, 6) + categoryIndex * 0.4;
      nodes.push({
        item,
        left: clamp(clusterLeft + Math.cos(itemAngle) * ring, 8, 92),
        top: clamp(clusterTop + Math.sin(itemAngle) * ring * 0.72, 11, 86),
        categoryLeft: clusterLeft,
        categoryTop: clusterTop
      });
    });
  });

  return { clusters, nodes };
}

function getCategoryName(item: CloudyItem): string {
  return item.category?.name ?? "Sem tag";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
