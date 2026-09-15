import { INTEGRATIONS_CATEGORY_ID, type CategorySummary, type CloudyItem } from "../../types/api";

export interface GraphCluster {
  categoryId: string;
  categoryName: string;
  left: number;
  top: number;
}

export interface CategoryGraphNode {
  category: CategorySummary;
  left: number;
  top: number;
}

export interface CategoryGraphLayout {
  nodes: CategoryGraphNode[];
  connections: GraphConnection[];
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
const INTEGRATIONS_NODE_POSITION = { left: 50, top: 72 };

export function buildCategoryGraphLayout(categories: CategorySummary[]): CategoryGraphLayout {
  const systemCategories = categories.filter((category) => category.id === INTEGRATIONS_CATEGORY_ID || category.isSystem);
  const userCategories = categories.filter((category) => !systemCategories.includes(category));
  const nodes: CategoryGraphNode[] = [];
  const ringCount = userCategories.length > 11 ? 2 : 1;
  const outerCount = ringCount === 1 ? userCategories.length : Math.ceil(userCategories.length / 2);
  const usesBalancedIntegrationRing = systemCategories.length > 0 && (userCategories.length === 9 || userCategories.length === 10);

  userCategories.forEach((category, index) => {
    const ring = ringCount === 1 || index < outerCount ? 0 : 1;
    const indexInRing = ring === 0 ? index : index - outerCount;
    const countInRing = ring === 0 ? outerCount : userCategories.length - outerCount;
    const isTwoCategoryBranch = userCategories.length === 2 && ring === 0;
    const isExpandedSingleRing = ringCount === 1 && userCategories.length > 6;
    const baseAngle = (isTwoCategoryBranch ? -Math.PI * 2 / 3 : -Math.PI / 2) + (indexInRing * Math.PI * 2) / Math.max(countInRing, 1) + (ring === 1 ? Math.PI / Math.max(countInRing, 1) : 0);
    const rebalancedPosition = getRebalancedInnerCategoryPosition(ring, countInRing, indexInRing);
    const angle = usesBalancedIntegrationRing
      ? reserveBottomIntegrationAngle(baseAngle)
      : ringCount === 1 && countInRing >= 6
      ? spreadLowerCategoryAngle(baseAngle)
      : spreadInnerLowerCategoryAngle(baseAngle, ring, countInRing, indexInRing);
    const radiusX = ring === 0 ? (isTwoCategoryBranch ? 42 : isExpandedSingleRing ? 42 : ringCount === 1 ? 34 : 44) : 29;
    const isInnerLowerCategory = ring === 1 && countInRing >= 7 && indexInRing >= countInRing - 3;
    const radiusY = ring === 0 ? (isExpandedSingleRing ? 35 : ringCount === 1 ? 22 : 40) : isInnerLowerCategory ? 16 : 20;
    const isInnerBottomCard = ring === 1 && indexInRing === Math.floor(countInRing / 2);
    const left = rebalancedPosition?.left ?? (isInnerBottomCard ? 50 : clamp(50 + Math.cos(angle) * radiusX, 10, 90));
    const bottomSideLift = ring === 0 ? Math.max(Math.sin(angle), 0) * Math.abs(Math.cos(angle)) * 14 : 0;
    const top = rebalancedPosition?.top ?? (isInnerBottomCard ? 20 : clamp(48 + Math.sin(angle) * radiusY - bottomSideLift, 9, isExpandedSingleRing ? 82 : ringCount === 1 ? 66 : 78));
    nodes.push({ category, left, top });
  });

  const integrationNodes = systemCategories.map((category) => ({ category, left: INTEGRATIONS_NODE_POSITION.left, top: INTEGRATIONS_NODE_POSITION.top }));
  const occupied = nodes.map(({ left, top }) => ({ left, top }));
  const positionedNodes = nodes.map((node) => {
    if (!systemCategories.length || !isReservedIntegrationSlot(node.left, node.top)) return node;
    const position = findIntegrationSlotAlternative(occupied, node);
    const currentIndex = occupied.findIndex((candidate) => candidate.left === node.left && candidate.top === node.top);
    if (currentIndex >= 0) occupied[currentIndex] = position;
    return { ...node, ...position };
  });
  const finalNodes = [...positionedNodes, ...integrationNodes];
  return {
    nodes: finalNodes,
    connections: finalNodes.map(({ left, top }) => ({ kind: "core", x1: 50, y1: 48, x2: left, y2: top }))
  };
}

function reserveBottomIntegrationAngle(angle: number): number {
  const integrationGap = Math.PI / 9;
  const distanceFromBottom = angle - Math.PI / 2;
  if (Math.abs(distanceFromBottom) >= integrationGap) return angle;
  return Math.PI / 2 + (distanceFromBottom <= 0 ? -integrationGap : integrationGap);
}

function spreadLowerCategoryAngle(angle: number): number {
  return angle >= Math.PI / 3 && angle < Math.PI ? angle - Math.PI / 6 : angle;
}

function spreadInnerLowerCategoryAngle(angle: number, ring: number, countInRing: number, indexInRing: number): number {
  if (ring !== 1 || countInRing < 7 || indexInRing < countInRing - 3) return angle;

  return [Math.PI / 3, Math.PI * 2 / 3, Math.PI * 5 / 6][indexInRing - (countInRing - 3)];
}

function getRebalancedInnerCategoryPosition(ring: number, countInRing: number, indexInRing: number): { left: number; top: number } | null {
  if (ring !== 1 || countInRing < 7) return null;

  const lowerSlot = indexInRing - (countInRing - 3);
  if (lowerSlot === 0) return { left: 35, top: 16 };
  if (lowerSlot === 2) return { left: 38, top: 34 };
  return null;
}

function isReservedIntegrationSlot(left: number, top: number): boolean {
  return Math.abs(left - INTEGRATIONS_NODE_POSITION.left) < 10 && top > 60;
}

function findIntegrationSlotAlternative(occupied: Array<{ left: number; top: number }>, node: { left: number; top: number }): { left: number; top: number } {
  const candidates = [
    { left: 22, top: 37 },
    { left: 20, top: 68 },
    { left: 80, top: 68 },
    { left: 16, top: 48 },
    { left: 84, top: 48 },
    { left: 50, top: 24 }
  ];
  return candidates.find((candidate) => candidate !== node && occupied.every((other) => other === node || Math.hypot(candidate.left - other.left, candidate.top - other.top) > 12)) ?? candidates[0];
}

export function buildCategoryItemGraphLayout(items: CloudyItem[]): ItemGraphLayout {
  const orderedItems = [...items].sort((first, second) => second.createdAt.localeCompare(first.createdAt) || second.id.localeCompare(first.id));
  const positions = createCircularItemPositions(orderedItems.length);
  const nodes: GraphNode[] = orderedItems.map((item, index) => ({
    item,
    left: positions[index].left,
    top: positions[index].top,
    categoryLeft: 50,
    categoryTop: 48
  }));

  return { clusters: [], nodes, connections: createCategoryItemConnections(nodes) };
}

function createCategoryItemConnections(nodes: GraphNode[]): GraphConnection[] {
  if (nodes.length === 0) return [];

  const anchorStride = nodes.length > 20 ? 4 : nodes.length > 10 ? 3 : 2;
  const anchorIndexes = nodes
    .map((_, index) => index)
    .filter((index) => index === 0 || index === nodes.length - 1 || index % anchorStride === 0);
  const connections: GraphConnection[] = anchorIndexes.map((index) => ({
    kind: "category",
    x1: 50,
    y1: 48,
    x2: nodes[index].left,
    y2: nodes[index].top
  }));

  for (let anchorIndex = 1; anchorIndex < anchorIndexes.length; anchorIndex += 2) {
    const previousNode = nodes[anchorIndexes[anchorIndex - 1]];
    const currentNode = nodes[anchorIndexes[anchorIndex]];
    connections.push({ kind: "item", x1: previousNode.left, y1: previousNode.top, x2: currentNode.left, y2: currentNode.top });
  }

  return connections;
}

const ITEM_LAYOUT_BOUNDS = { leftMin: 8, leftMax: 92, topMin: 13, topMax: 88 };

function createCircularItemPositions(itemCount: number): Array<{ left: number; top: number }> {
  if (itemCount === 0) return [];

  const ringCounts = createCircularRingCounts(itemCount);
  const ringTotal = ringCounts.length;
  const positions: Array<{ left: number; top: number }> = [];

  ringCounts.forEach((ringItemCount, ringIndex) => {
    const isSingleRing = ringTotal === 1;
    const ringProgress = isSingleRing ? 0 : ringIndex / Math.max(ringTotal - 1, 1);
    const radiusX = isSingleRing
      ? itemCount <= 4 ? 28 : itemCount <= 8 ? 34 : 38
      : itemCount <= 4 ? 28 + ringProgress * 6
        : itemCount <= 8 ? 30 + ringProgress * 8
          : itemCount <= 12 ? 28 + ringProgress * 20
            : 28 + ringProgress * 20;
    const radiusY = isSingleRing
      ? itemCount <= 4 ? 25 : itemCount <= 8 ? 28 : 30
      : itemCount <= 4 ? 25 + ringProgress * 4
        : itemCount <= 8 ? 26 + ringProgress * 5
          : itemCount <= 12 ? 25 + ringProgress * 15
            : 25 + ringProgress * 14;
    const angleOffset = ringIndex % 2 === 0 ? 0 : Math.PI / ringItemCount;

    for (let itemIndex = 0; itemIndex < ringItemCount; itemIndex += 1) {
      const angle = -Math.PI / 2 + angleOffset + (itemIndex * Math.PI * 2) / ringItemCount;
      const left = 50 + Math.cos(angle) * radiusX;
      const top = 48 + Math.sin(angle) * radiusY;
      positions.push({
        left: isSingleRing ? clamp(left, ITEM_LAYOUT_BOUNDS.leftMin, ITEM_LAYOUT_BOUNDS.leftMax) : left,
        top: isSingleRing ? clamp(top, ITEM_LAYOUT_BOUNDS.topMin, ITEM_LAYOUT_BOUNDS.topMax) : top
      });
    }
  });

  return positions;
}

function createCircularRingCounts(itemCount: number): number[] {
  if (itemCount === 1) return [1];
  if (itemCount <= 4) return [1, itemCount - 1];
  if (itemCount === 5) return [1, 4];
  if (itemCount <= 8) return [Math.ceil(itemCount * .4), itemCount - Math.ceil(itemCount * .4)];
  if (itemCount <= 12) return [4, itemCount - 4];
  if (itemCount <= 28) return [Math.ceil(itemCount * .4), itemCount - Math.ceil(itemCount * .4)];
  if (itemCount <= 48) return [8, 14, itemCount - 22];
  const firstRingCount = Math.ceil(itemCount * .23);
  const secondRingCount = Math.ceil(itemCount * .31);
  return [firstRingCount, secondRingCount, itemCount - firstRingCount - secondRingCount];
}

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
