import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import { IntegrationDialog } from "./IntegrationDialog";

vi.mock("../../lib/api", () => ({ apiBaseUrl: "https://cloudy-api.isumi.com.br", apiRequest: vi.fn() }));

const mockedApiRequest = vi.mocked(apiRequest);

describe("IntegrationDialog", () => {
  it("apresenta um loading contextual enquanto busca a configuração", () => {
    mockedApiRequest.mockReturnValueOnce(new Promise<never>(() => {}));
    render(<IntegrationDialog open onClose={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveClass("integration-loading");
    expect(screen.getByText("Carregando configurações")).toBeInTheDocument();
    expect(screen.getByText("Buscando os dados do Atalho...")).toBeInTheDocument();
    expect(document.querySelector(".integration-loading-spinner")).toBeInTheDocument();
  });

  it("gera e permite copiar o token do Atalho", async () => {
    mockedApiRequest.mockResolvedValueOnce({ configured: false, tokenPrefix: null, createdAt: null, lastUsedAt: null });
    mockedApiRequest.mockResolvedValueOnce({ configured: true, token: "cly_cap_abc", tokenPrefix: "cly_cap_abc", createdAt: "now", lastUsedAt: null });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<IntegrationDialog open onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar token" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Gerar token" }));

    expect(await screen.findByText("cly_cap_abc")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copiar token" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Token copiado" })).toBeInTheDocument());
  });

  it("carrega o estado ativo sem mostrar o segredo novamente", async () => {
    mockedApiRequest.mockResolvedValueOnce({ configured: true, tokenPrefix: "cly_cap_abc", createdAt: "now", lastUsedAt: null });
    render(<IntegrationDialog open onClose={vi.fn()} />);

    expect(await screen.findByText("cly_cap_abc****")).toBeInTheDocument();
    expect(screen.queryByText("Token ativo")).not.toBeInTheDocument();
    expect(screen.queryByText("cly_cap_abc", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar novo token" })).toBeInTheDocument();
    expect(document.querySelector(".integration-steps li:last-child")?.textContent).toBe("Envie um JSON somente com url.");
  });

  it("fecha com Escape e pelo botão de fechar", async () => {
    mockedApiRequest.mockResolvedValue({ configured: false, tokenPrefix: null, createdAt: null, lastUsedAt: null });
    const onClose = vi.fn();
    render(<IntegrationDialog open onClose={onClose} />);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Fechar integrações" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fecha ao arrastar o handle do drawer para baixo", () => {
    mockedApiRequest.mockResolvedValue({ configured: false, tokenPrefix: null, createdAt: null, lastUsedAt: null });
    const onClose = vi.fn();
    render(<IntegrationDialog open onClose={onClose} />);
    const handle = document.querySelector(".mobile-drawer-handle")!;

    const createPointerEvent = (type: string, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: 100, clientY });
      Object.defineProperty(event, "pointerId", { value: 1 });
      Object.defineProperty(event, "pointerType", { value: "touch" });
      return event;
    };
    fireEvent(handle, createPointerEvent("pointerdown", 100));
    fireEvent(handle, createPointerEvent("pointermove", 220));
    fireEvent(handle, createPointerEvent("pointerup", 220));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toHaveStyle({ transform: "translateY(120px)" });
  });
});
