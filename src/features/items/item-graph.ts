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

export interface GraphConnection {
  kind: "core" | "category" | "item";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ItemGraphLayout {
  clusters: GraphCluster[];
  nodes: GraphNode[];
  connections: GraphConnection[];
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
  const connections: GraphConnection[] = [];

  categories.forEach(([categoryId, categoryItems], categoryIndex) => {
    const angle = -Math.PI / 2 + (categoryIndex * Math.PI * 2) / Math.max(categories.length, 1);
    const clusterLeft = clamp(50 + Math.cos(angle) * (categories.length === 1 ? 0 : 31), 14, 86);
    const clusterTop = clamp(48 + Math.sin(angle) * (categories.length === 1 ? 25 : 27), 16, 80);
    const cluster = { categoryId, categoryName: getCategoryName(categoryItems[0]), left: clusterLeft, top: clusterTop };
    clusters.push(cluster);
    connections.push({ kind: "core", x1: 50, y1: 48, x2: clusterLeft, y2: clusterTop });

    const orderedItems = [...categoryItems].sort((first, second) => first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id));
    const clusterNodes: GraphNode[] = [];
    orderedItems.forEach((item, itemIndex) => {
      const ring = orderedItems.length === 1 ? 0 : 9 + Math.floor(itemIndex / 6) * 6;
      const itemAngle = orderedItems.length === 1 ? 0 : (itemIndex * Math.PI * 2) / Math.min(orderedItems.length, 6) + categoryIndex * 0.4;
      const node = {
        item,
        left: clamp(clusterLeft + Math.cos(itemAngle) * ring, 8, 92),
        top: clamp(clusterTop + Math.sin(itemAngle) * ring * 0.72, 11, 86),
        categoryLeft: clusterLeft,
        categoryTop: clusterTop
      };
      clusterNodes.push(node);
      nodes.push(node);
    });

    clusterNodes.forEach((node, nodeIndex) => {
      if (node.left !== clusterLeft || node.top !== clusterTop) {
        connections.push({ kind: "category", x1: clusterLeft, y1: clusterTop, x2: node.left, y2: node.top });
      }
      const nextNode = clusterNodes[nodeIndex + 1];
      if (nextNode) connections.push({ kind: "item", x1: node.left, y1: node.top, x2: nextNode.left, y2: nextNode.top });
    });
  });

  return { clusters, nodes, connections };
}

function getCategoryName(item: CloudyItem): string {
  return item.category?.name ?? "Vazio";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
