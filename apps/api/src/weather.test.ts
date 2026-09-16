import { describe, expect, it, vi } from "vitest";
import { fetchMascotWeather, parseMascotWeatherCoordinates } from "./weather";

describe("mascot weather", () => {
  it("arredonda e valida coordenadas", () => {
    expect(parseMascotWeatherCoordinates({ latitude: -23.556, longitude: -46.633 })).toEqual({ latitude: -23.56, longitude: -46.63 });
    expect(() => parseMascotWeatherCoordinates({ latitude: 91, longitude: 0 })).toThrow("invalid_weather_coordinates");
    expect(() => parseMascotWeatherCoordinates({ latitude: 0, longitude: Number.NaN })).toThrow("invalid_weather_coordinates");
  });

  it("normaliza chuva, pancadas e códigos meteorológicos", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(new URL(input.toString()).searchParams.get("current")).toBe("rain,showers,weather_code");
      return new Response(JSON.stringify({ current: { rain: 0, showers: 0, weather_code: 61 } }));
    });
    await expect(fetchMascotWeather({ latitude: -23.56, longitude: -46.63 }, fetcher)).resolves.toEqual({ isRaining: true });

    const dryFetcher = vi.fn(async () => new Response(JSON.stringify({ current: { rain: 0, showers: 0, weather_code: 0 } })));
    await expect(fetchMascotWeather({ latitude: 0, longitude: 0 }, dryFetcher)).resolves.toEqual({ isRaining: false });
  });

  it("converte falhas externas em erro genérico", async () => {
    await expect(fetchMascotWeather({ latitude: 0, longitude: 0 }, vi.fn(async () => new Response("upstream", { status: 503 })))).rejects.toThrow("weather_unavailable");
    await expect(fetchMascotWeather({ latitude: 0, longitude: 0 }, vi.fn(async () => new Response("not-json")))).rejects.toThrow("weather_unavailable");
  });
});
