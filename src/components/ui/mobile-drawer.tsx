import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type PointerEventHandler } from "react";

const CLOSE_DISTANCE = 96;
const CLOSE_VELOCITY = 0.65;
const INTERACTIVE_SELECTOR = "button, a, input, textarea, select, [contenteditable=\"true\"], [role=\"button\"]";

export interface MobileDrawerGesture {
  handleProps: {
    onPointerDown: PointerEventHandler<HTMLElement>;
    onPointerMove: PointerEventHandler<HTMLElement>;
    onPointerUp: PointerEventHandler<HTMLElement>;
    onPointerCancel: PointerEventHandler<HTMLElement>;
  };
  panelProps: MobileDrawerGesture["handleProps"];
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

  const onPointerDown: PointerEventHandler<HTMLElement> = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) return;
    startRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDragging(true);
    updateOffset(0);
  };

  const onPointerMove: PointerEventHandler<HTMLElement> = (event) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const verticalDistance = event.clientY - start.y;
    const horizontalDistance = Math.abs(event.clientX - start.x);
    const isDownwardGesture = verticalDistance > 0 && verticalDistance >= horizontalDistance * 0.75;
    if (isDownwardGesture) event.preventDefault();
    updateOffset(isDownwardGesture ? verticalDistance : 0);
  };

  const finishGesture = (event: PointerEvent<HTMLElement>) => {
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

  const cancelGesture: PointerEventHandler<HTMLElement> = (event) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    startRef.current = null;
    setIsDragging(false);
    updateOffset(0);
  };

  return {
    handleProps: { onPointerDown, onPointerMove, onPointerUp: finishGesture, onPointerCancel: cancelGesture },
    panelProps: { onPointerDown, onPointerMove, onPointerUp: finishGesture, onPointerCancel: cancelGesture },
    isDragging,
    panelStyle: offset > 0 ? { transform: `translateY(${offset}px)`, "--drawer-exit-offset": `${offset}px` } as CSSProperties : undefined
  };
}

export function useMobileDrawerBodyLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [active]);
}
