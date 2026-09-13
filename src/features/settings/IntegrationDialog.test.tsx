import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import { IntegrationDialog } from "./IntegrationDialog";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn() }));

const mockedApiRequest = vi.mocked(apiRequest);

describe("IntegrationDialog", () => {
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

    expect(await screen.findByText(/Token ativo/)).toBeInTheDocument();
    expect(screen.queryByText("cly_cap_abc", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar novo token" })).toBeInTheDocument();
  });
});
