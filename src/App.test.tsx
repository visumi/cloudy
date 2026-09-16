import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const authState = vi.hoisted(() => ({
  ready: true,
  profileLoading: false,
  user: { email: "ana@example.com" },
  profile: { allowed: true },
  authError: null as string | null
}));

vi.mock("./hooks/use-auth", () => ({ useAuth: () => authState }));
vi.mock("./features/login/LoginPage", () => ({ LoginPage: () => <div>login</div> }));
vi.mock("./features/dashboard/CloudyShell", () => ({
  CloudyShell: ({ onReadyChange }: { onReadyChange?: (ready: boolean) => void }) => <button type="button" onClick={() => onReadyChange?.(true)}>dashboard-ready</button>
}));

afterEach(() => {
  document.getElementById("boot-loading")?.remove();
  vi.useRealTimers();
});

describe("App", () => {
  it("mantém o loading principal até o dashboard concluir suas chamadas iniciais", () => {
    const bootLoading = document.createElement("div");
    bootLoading.id = "boot-loading";
    document.body.appendChild(bootLoading);

    render(<App />);
    expect(screen.getByRole("button", { name: "dashboard-ready" })).toBeInTheDocument();
    expect(bootLoading).not.toHaveAttribute("data-leaving");

    fireEvent.click(screen.getByRole("button", { name: "dashboard-ready" }));
    expect(bootLoading).toHaveAttribute("data-leaving", "true");
  });
});
