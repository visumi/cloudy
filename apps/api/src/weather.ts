import { HttpError } from "./shared";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const RAIN_WEATHER_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

export interface MascotWeatherCoordinates {
  latitude: number;
  longitude: number;
}

interface OpenMeteoCurrent {
  rain?: unknown;
  showers?: unknown;
  weather_code?: unknown;
}

interface OpenMeteoResponse {
  current?: OpenMeteoCurrent;
}

export function parseMascotWeatherCoordinates(value: unknown): MascotWeatherCoordinates {
  if (!value || typeof value !== "object") throw new HttpError(400, "invalid_weather_coordinates");
  const input = value as Record<string, unknown>;
  const latitude = readCoordinate(input.latitude, -90, 90);
  const longitude = readCoordinate(input.longitude, -180, 180);
  return { latitude, longitude };
}

export async function fetchMascotWeather(
  coordinates: MascotWeatherCoordinates,
  fetcher: typeof fetch = fetch
): Promise<{ isRaining: boolean }> {
  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("latitude", coordinates.latitude.toString());
  url.searchParams.set("longitude", coordinates.longitude.toString());
  url.searchParams.set("current", "rain,showers,weather_code");
  url.searchParams.set("timezone", "America/Sao_Paulo");

  let response: Response;
  try {
    response = await fetcher(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new HttpError(502, "weather_unavailable");
  }
  if (!response.ok) throw new HttpError(502, "weather_unavailable");

  let payload: OpenMeteoResponse;
  try {
    payload = await response.json() as OpenMeteoResponse;
  } catch {
    throw new HttpError(502, "weather_unavailable");
  }
  const current = payload.current;
  if (!current || !isFiniteNumber(current.rain) || !isFiniteNumber(current.showers) || !isFiniteNumber(current.weather_code)) {
    throw new HttpError(502, "weather_unavailable");
  }

  return {
    isRaining: current.rain > 0 || current.showers > 0 || RAIN_WEATHER_CODES.has(current.weather_code)
  };
}

function readCoordinate(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new HttpError(400, "invalid_weather_coordinates");
  }
  return Math.round(value * 100) / 100;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
