import { useRef, useState, type CSSProperties, type PointerEvent, type PointerEventHandler } from "react";

const CLOSE_DISTANCE = 96;
const CLOSE_VELOCITY = 0.65;

export interface MobileDrawerGesture {
  handleProps: {
    onPointerDown: PointerEventHandler<HTMLDivElement>;
    onPointerMove: PointerEventHandler<HTMLDivElement>;
    onPointerUp: PointerEventHandler<HTMLDivElement>;
    onPointerCancel: PointerEventHandler<HTMLDivElement>;
  };
  isDragging: boolean;
  panelStyle?: CSSProperties;
}

export function useMobileDrawerGesture(onClose: () => void): MobileDrawerGesture {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef<{ pointerId: number; x: number; y: number; time: number } | null>(null);
  const offsetRef = useRef(0);

  const updateOffset = (nextOffset: number) => {
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  };

  const onPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    startRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDragging(true);
    updateOffset(0);
  };

  const onPointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const verticalDistance = event.clientY - start.y;
    const horizontalDistance = Math.abs(event.clientX - start.x);
    updateOffset(verticalDistance > 0 && verticalDistance >= horizontalDistance * 0.75 ? verticalDistance : 0);
  };

  const finishGesture = (event: PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const elapsed = Math.max(performance.now() - start.time, 1);
    const currentOffset = offsetRef.current;
    const velocity = currentOffset / elapsed;
    const shouldClose = currentOffset >= CLOSE_DISTANCE || velocity >= CLOSE_VELOCITY;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    startRef.current = null;
    setIsDragging(false);
    if (shouldClose) {
      updateOffset(currentOffset);
      onClose();
    } else {
      updateOffset(0);
    }
  };

  const cancelGesture: PointerEventHandler<HTMLDivElement> = (event) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    startRef.current = null;
    setIsDragging(false);
    updateOffset(0);
  };

  return {
    handleProps: { onPointerDown, onPointerMove, onPointerUp: finishGesture, onPointerCancel: cancelGesture },
    isDragging,
    panelStyle: offset > 0 ? { transform: `translateY(${offset}px)`, "--drawer-exit-offset": `${offset}px` } as CSSProperties : undefined
  };
}
