import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import {
  getMillisecondsUntilMascotBoundary,
  getTimeMascotVariant,
  resolveMascotVariant,
  roundMascotCoordinate,
  useMascotVariant
} from "./use-mascot-variant";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn() }));

const mockedApiRequest = vi.mocked(apiRequest);
const originalGeolocation = Object.getOwnPropertyDescriptor(Navigator.prototype, "geolocation");

function Probe() {
  return <output data-testid="variant">{useMascotVariant() ?? "loading"}</output>;
}

function setGeolocation(geolocation: Geolocation) {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: geolocation });
}

afterEach(() => {
  vi.useRealTimers();
  mockedApiRequest.mockReset();
  if (originalGeolocation) Object.defineProperty(Navigator.prototype, "geolocation", originalGeolocation);
  else Reflect.deleteProperty(navigator, "geolocation");
});

describe("resolução da variante do mascote", () => {
  it("aplica as fronteiras BRT e a prioridade da chuva", () => {
    expect(getTimeMascotVariant(new Date("2026-09-15T09:00:00.000Z"))).toBe("default");
    expect(getTimeMascotVariant(new Date("2026-09-15T22:59:59.000Z"))).toBe("default");
    expect(getTimeMascotVariant(new Date("2026-09-15T23:00:00.000Z"))).toBe("night");
    expect(getTimeMascotVariant(new Date("2026-09-15T08:59:59.000Z"))).toBe("night");
    expect(getTimeMascotVariant(new Date("2026-09-15T09:00:00.000Z"))).toBe("default");
    expect(resolveMascotVariant(new Date("2026-09-15T23:00:00.000Z"), true)).toBe("rainy");
    expect(roundMascotCoordinate(-23.556)).toBe(-23.56);
  });

  it("calcula somente a próxima fronteira de horário", () => {
    const beforeNight = new Date("2026-09-15T22:59:59.000Z");
    expect(getMillisecondsUntilMascotBoundary(beforeNight)).toBe(1_000);
    const beforeDay = new Date("2026-09-15T08:59:59.000Z");
    expect(getMillisecondsUntilMascotBoundary(beforeDay)).toBe(1_000);
  });

  it("troca de default para night na fronteira sem polling", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T22:59:59.000Z"));
    setGeolocation({ getCurrentPosition: (_success, error) => error?.({ code: 1, message: "denied" } as GeolocationPositionError) } as Geolocation);
    render(<Probe />);
    expect(screen.getByTestId("variant")).toHaveTextContent("default");
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId("variant")).toHaveTextContent("night");
    expect(mockedApiRequest).not.toHaveBeenCalled();
  });

  it("mantém rainy após a fronteira e envia coordenadas arredondadas", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T22:59:00.000Z"));
    let resolveWeather!: (result: { isRaining: boolean }) => void;
    mockedApiRequest.mockImplementation(() => new Promise((resolve) => { resolveWeather = resolve; }));
    setGeolocation({
      getCurrentPosition: (success) => success({ coords: { latitude: -23.556, longitude: -46.633 } } as GeolocationPosition)
    } as Geolocation);
    render(<Probe />);
    expect(screen.getByTestId("variant")).toHaveTextContent("loading");
    await act(async () => { resolveWeather({ isRaining: true }); await Promise.resolve(); });
    expect(screen.getByTestId("variant")).toHaveTextContent("rainy");
    expect(mockedApiRequest).toHaveBeenCalledWith("/mascot-weather", { method: "POST", body: JSON.stringify({ latitude: -23.56, longitude: -46.63 }) });
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByTestId("variant")).toHaveTextContent("rainy");
  });

  it("usa o fallback BRT quando geolocalização ou provedor falham", async () => {
    setGeolocation({ getCurrentPosition: (_success, error) => error?.({ code: 3, message: "timeout" } as GeolocationPositionError) } as Geolocation);
    const { unmount } = render(<Probe />);
    expect(screen.getByTestId("variant")).toHaveTextContent(getTimeMascotVariant());
    unmount();

    mockedApiRequest.mockRejectedValue(new Error("provider"));
    setGeolocation({ getCurrentPosition: (success) => success({ coords: { latitude: 0, longitude: 0 } } as GeolocationPosition) } as Geolocation);
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("variant")).toHaveTextContent(getTimeMascotVariant()));
  });
});
