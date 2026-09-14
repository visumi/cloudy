import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import { ShareDialog } from "./ShareDialog";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn() }));
const mockedApiRequest = vi.mocked(apiRequest);
const categories = [
  { id: "ideas", name: "Ideias", color: "#A78BFA", itemCount: 2, recentItems: [] },
  { id: "empty-category", name: "Sem itens", color: "#CBD5E1", itemCount: 0, recentItems: [] },
  { id: "empty", name: "Vazio", color: "#CBD5E1", itemCount: 1, recentItems: [], isVirtual: true },
  { id: "integrations", name: "Integrações", color: "#38BDF8", itemCount: 1, recentItems: [], isSystem: true }
];

describe("ShareDialog", () => {
  it("lista apenas coleções compartilháveis e gera o link", async () => {
    mockedApiRequest.mockResolvedValueOnce({ shareId: "share-1" });
    render(<ShareDialog open categories={categories} onClose={vi.fn()} />);

    expect(screen.getByText("Ideias")).toBeInTheDocument();
    expect(screen.queryByText("Sem itens")).not.toBeInTheDocument();
    expect(screen.queryByText("Vazio")).not.toBeInTheDocument();
    expect(screen.queryByText("Integrações")).not.toBeInTheDocument();
    const card = screen.getByText("Ideias").closest("label");
    expect(card).not.toBeNull();
    fireEvent.click(card!);
    expect(screen.getByLabelText(/Ideias/)).toBeChecked();
    fireEvent.click(card!);
    expect(screen.getByLabelText(/Ideias/)).not.toBeChecked();
    fireEvent.click(card!);
    fireEvent.click(screen.getByRole("button", { name: "Compartilhar" }));

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/shares", expect.objectContaining({ method: "POST", body: JSON.stringify({ categoryIds: ["ideas"] }) })));
    const shareLink = await screen.findByDisplayValue(/\?share=share-1/);
    expect(shareLink).toHaveAttribute("title", expect.stringContaining("?share=share-1"));
    expect(screen.queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar link" })).toBeInTheDocument();
  });
});
