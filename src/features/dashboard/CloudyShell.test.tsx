import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import { CloudyShell } from "./CloudyShell";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn() }));
vi.mock("../../hooks/use-auth", () => ({
  useAuth: () => ({
    profile: { name: "Ana Souza", email: "ana@example.com", picture: null },
    signOutUser: vi.fn().mockResolvedValue(undefined),
    user: { email: "ana@example.com", photoURL: null }
  })
}));
vi.mock("./CloudMascot", () => ({ CloudMascot: () => <div aria-hidden="true" /> }));
vi.mock("../items/ItemGraph", () => ({
  ItemGraph: ({ children, onDetailOpenChange }: { children: ReactNode; onDetailOpenChange?: (open: boolean) => void }) => (
    <div>
      {children}
      <button type="button" onClick={() => onDetailOpenChange?.(true)}>Abrir detalhe</button>
      <button type="button" onClick={() => onDetailOpenChange?.(false)}>Fechar detalhe</button>
    </div>
  )
}));
vi.mock("../items/ItemDialog", () => ({
  ItemDialog: ({ open, onClose, onClosingChange }: { open: boolean; onClose: () => void; onClosingChange?: (closing: boolean) => void }) => open ? <div role="dialog"><button type="button" onClick={() => { onClosingChange?.(true); onClose(); window.setTimeout(() => onClosingChange?.(false), 220); }}>Fechar</button></div> : null
}));

const mockedApiRequest = vi.mocked(apiRequest);

describe("CloudyShell", () => {
  it("oculta o dock enquanto o drawer de adicionar link está aberto", async () => {
    mockedApiRequest.mockResolvedValueOnce({ items: [] });
    mockedApiRequest.mockResolvedValueOnce({ categories: [] });
    const { container } = render(<CloudyShell />);
    const dock = container.querySelector(".action-cloud-dock")!;

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/items"));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar referência" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(dock).toHaveClass("action-cloud-dock--hidden");
    expect(dock).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("main")).toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(dock).toHaveClass("action-cloud-dock--hidden");
    await waitFor(() => {
      expect(dock).not.toHaveClass("action-cloud-dock--hidden");
      expect(dock).toHaveAttribute("aria-hidden", "false");
      expect(container.querySelector("main")).not.toHaveAttribute("inert");
    });
  });

  it("oculta o dock enquanto o detalhe de um item está aberto", async () => {
    mockedApiRequest.mockResolvedValueOnce({ items: [] });
    mockedApiRequest.mockResolvedValueOnce({ categories: [] });
    const { container } = render(<CloudyShell />);
    const dock = container.querySelector(".action-cloud-dock")!;

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/items"));
    fireEvent.click(screen.getByRole("button", { name: "Abrir detalhe" }));

    expect(dock).toHaveClass("action-cloud-dock--hidden");
    expect(dock).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("main")).toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Fechar detalhe" }));
    expect(dock).not.toHaveClass("action-cloud-dock--hidden");
    expect(dock).toHaveAttribute("aria-hidden", "false");
    expect(container.querySelector("main")).not.toHaveAttribute("inert");
  });
});
