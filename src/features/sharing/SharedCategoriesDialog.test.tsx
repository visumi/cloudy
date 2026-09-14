import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import { SharedCategoriesDialog } from "./SharedCategoriesDialog";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn(), ApiError: class ApiError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } } }));
const mockedApiRequest = vi.mocked(apiRequest);

describe("SharedCategoriesDialog", () => {
  it("limita a seleção pelos slots e importa o lote escolhido", async () => {
    mockedApiRequest.mockResolvedValueOnce({ id: "share-1", createdAt: "now", categories: [
      { id: "shared-a", name: "Ideias", color: "#A78BFA", itemCount: 2 },
      { id: "shared-b", name: "Leituras", color: "#38BDF8", itemCount: 1 }
    ] });
    mockedApiRequest.mockResolvedValueOnce({ categories: [{ id: "copy", name: "Ideias", color: "#A78BFA", itemCount: 2, recentItems: [] }] });
    render(<SharedCategoriesDialog open shareId="share-1" currentCategoryCount={14} onClose={vi.fn()} onImported={vi.fn()} />);

    expect(await screen.findByLabelText(/Ideias/)).toBeInTheDocument();
    expect(screen.queryByText("slots disponíveis")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Ideias/));
    expect(screen.getByLabelText(/Leituras/)).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar selecionadas" }));
    await waitFor(() => expect(mockedApiRequest).toHaveBeenLastCalledWith("/shares/share-1/imports", expect.objectContaining({ method: "POST", body: JSON.stringify({ shareCategoryIds: ["shared-a"] }) })));
  });

  it("mantém apenas o fechamento do cabeçalho quando o link não está disponível", async () => {
    mockedApiRequest.mockRejectedValueOnce(new Error("share unavailable"));
    render(<SharedCategoriesDialog open shareId="missing" currentCategoryCount={0} onClose={vi.fn()} onImported={vi.fn()} />);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/shares/missing"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não conseguimos carregar este compartilhamento agora.");
    expect(screen.queryByRole("button", { name: /^Fechar$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechar coleções compartilhadas" })).toBeInTheDocument();
  });
});
