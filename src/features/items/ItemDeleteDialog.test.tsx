import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../../lib/api";
import type { CloudyItem } from "../../types/api";
import { ItemDeleteDialog } from "./ItemDeleteDialog";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);
const item: CloudyItem = {
  id: "item-1",
  name: "Página de inspiração",
  url: "https://example.com",
  imageUrl: null,
  faviconUrl: null,
  observation: null,
  category: { id: "category-1", name: "Ideias", color: "#A78BFA" },
  createdAt: "2026-09-11T00:00:00Z",
  updatedAt: "2026-09-11T00:00:00Z"
};

beforeEach(() => { mockedApiRequest.mockReset(); });

describe("ItemDeleteDialog", () => {
  it("explica a ação, inicia no cancelamento e permite voltar", async () => {
    const onClose = vi.fn();
    render(<ItemDeleteDialog open item={item} onClose={onClose} onDeleted={vi.fn()} />);

    expect(screen.getByRole("alertdialog", { name: "Excluir item?" })).toHaveTextContent('"Página de inspiração" será removido permanentemente');
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("exclui o item autenticado e devolve o registro removido", async () => {
    const onDeleted = vi.fn();
    mockedApiRequest.mockResolvedValueOnce({ id: item.id });
    render(<ItemDeleteDialog open item={item} onClose={vi.fn()} onDeleted={onDeleted} />);

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/items/item-1", { method: "DELETE" }));
    expect(onDeleted).toHaveBeenCalledWith(item);
  });

  it("mantém a confirmação aberta quando a exclusão falha", async () => {
    mockedApiRequest.mockRejectedValueOnce(new ApiError(404, "item_not_found"));
    render(<ItemDeleteDialog open item={item} onClose={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Este item não está mais disponível.");
    expect(screen.getByRole("alertdialog", { name: "Excluir item?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir" })).not.toBeDisabled();
  });
});
