import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../lib/api";

export type MascotVariant = "default" | "night" | "rainy";

const BRT_TIME_ZONE = "America/Sao_Paulo";
const DAY_START_MINUTES = 6 * 60;
const NIGHT_START_MINUTES = 20 * 60;

export function getTimeMascotVariant(date: Date = new Date()): Exclude<MascotVariant, "rainy"> {
  const hour = getBrtTimeParts(date).hour;
  return hour >= 20 || hour < 6 ? "night" : "default";
}

export function resolveMascotVariant(date: Date, isRaining: boolean): MascotVariant {
  return isRaining ? "rainy" : getTimeMascotVariant(date);
}

export function getMillisecondsUntilMascotBoundary(date: Date = new Date()): number {
  const { hour, minute, second } = getBrtTimeParts(date);
  const currentMinutes = hour * 60 + minute + second / 60 + date.getMilliseconds() / 60_000;
  const nextBoundary = [DAY_START_MINUTES, NIGHT_START_MINUTES, DAY_START_MINUTES + 24 * 60]
    .find((boundary) => boundary > currentMinutes) ?? DAY_START_MINUTES + 24 * 60;
  return Math.max((nextBoundary - currentMinutes) * 60_000, 1_000);
}

export function roundMascotCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function useMascotVariant(): MascotVariant | null {
  const [variant, setVariant] = useState<MascotVariant | null>(null);
  const rainyRef = useRef(false);
  const resolvedRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    let boundaryTimeout = 0;

    const updateTimeVariant = () => {
      if (!disposed && resolvedRef.current && !rainyRef.current) setVariant(getTimeMascotVariant());
    };
    const scheduleNextBoundary = () => {
      boundaryTimeout = window.setTimeout(() => {
        updateTimeVariant();
        scheduleNextBoundary();
      }, getMillisecondsUntilMascotBoundary());
    };
    scheduleNextBoundary();

    const geolocation = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
    const resolveWithFallback = (isRaining: boolean) => {
      if (disposed) return;
      resolvedRef.current = true;
      if (isRaining) {
        rainyRef.current = true;
        setVariant("rainy");
      } else {
        setVariant(getTimeMascotVariant());
      }
    };
    if (!geolocation) {
      resolveWithFallback(false);
      return () => {
        disposed = true;
        window.clearTimeout(boundaryTimeout);
      };
    }

    try {
      geolocation.getCurrentPosition(
        (position) => {
          if (disposed) return;
          const coordinates = {
            latitude: roundMascotCoordinate(position.coords.latitude),
            longitude: roundMascotCoordinate(position.coords.longitude)
          };
          void apiRequest<{ isRaining: boolean }>("/mascot-weather", {
            method: "POST",
            body: JSON.stringify(coordinates)
          }).then((result) => resolveWithFallback(result.isRaining === true)).catch(() => resolveWithFallback(false));
        },
        () => resolveWithFallback(false),
        { enableHighAccuracy: false, maximumAge: 0, timeout: 8_000 }
      );
    } catch {
      resolveWithFallback(false);
    }

    return () => {
      disposed = true;
      window.clearTimeout(boundaryTimeout);
    };
  }, []);

  return variant;
}

function getBrtTimeParts(date: Date): { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? 0),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? 0),
    second: Number(parts.find((part) => part.type === "second")?.value ?? 0)
  };
}
