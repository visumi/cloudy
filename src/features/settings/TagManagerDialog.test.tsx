import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import type { CategorySummary } from "../../types/api";
import { TagManagerDialog } from "./TagManagerDialog";

vi.mock("../../lib/api", () => ({
  apiRequest: vi.fn()
}));

const mockedApiRequest = vi.mocked(apiRequest);
const categories: CategorySummary[] = [{ id: "category-1", name: "Ideias", color: "#A78BFA", itemCount: 0, recentItems: [] }];

beforeEach(() => mockedApiRequest.mockReset());

describe("TagManagerDialog", () => {
  it("cria uma coleção usando o nome, a cor e a prévia", async () => {
    const onCategoriesChange = vi.fn();
    mockedApiRequest.mockResolvedValueOnce({ id: "category-2", name: "Inspirações", color: "#FB7185", itemCount: 0 });
    render(<TagManagerDialog open categories={categories} onClose={vi.fn()} onCategoriesChange={onCategoriesChange} />);

    expect(screen.getByText("1/15")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome da coleção")).toHaveAttribute("maxLength", "12");
    expect(screen.getByRole("button", { name: "Criar coleção" }).querySelector("svg")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome da coleção"), { target: { value: "Inspirações" } });
    fireEvent.click(screen.getByRole("button", { name: "Rosa" }));
    expect(screen.getByLabelText("Prévia da coleção Inspirações")).toBeInTheDocument();
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    await waitFor(() => expect(onCategoriesChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: "Inspirações", color: "#FB7185" })])));
    expect(mockedApiRequest).toHaveBeenCalledWith("/categories", expect.objectContaining({ method: "POST" }));
  });

  it("edita e exclui uma coleção sem itens", async () => {
    const onCategoriesChange = vi.fn();
    mockedApiRequest.mockResolvedValueOnce({ id: "category-1", name: "Projetos", color: "#A78BFA", itemCount: 0 });
    render(<TagManagerDialog open categories={categories} onClose={vi.fn()} onCategoriesChange={onCategoriesChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar coleção Ideias" }));
    fireEvent.change(screen.getByLabelText("Nome da coleção"), { target: { value: "Projetos" } });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/categories/category-1", expect.objectContaining({ method: "PATCH" })));

    mockedApiRequest.mockResolvedValueOnce({ id: "category-1" });
    fireEvent.click(screen.getByRole("button", { name: "Excluir coleção Ideias" }));
    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/categories/category-1", expect.objectContaining({ method: "DELETE" })));
  });

  it("desabilita a exclusão de coleções com itens", () => {
    const categoryWithItems: CategorySummary = { ...categories[0], itemCount: 1 };
    render(<TagManagerDialog open categories={[categoryWithItems]} onClose={vi.fn()} onCategoriesChange={vi.fn()} />);

    const deleteButton = screen.getByRole("button", { name: "Coleção Ideias tem itens" });
    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute("title", "Remova os itens antes de excluir");
  });

  it("mantém o shell enxuto e fecha com Escape", () => {
    const onClose = vi.fn();
    render(<TagManagerDialog open categories={[]} onClose={onClose} onCategoriesChange={vi.fn()} />);

    expect(screen.queryByText("Escolha uma para dar o tom")).not.toBeInTheDocument();
    expect(screen.queryByText("Sua paleta")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fecha ao arrastar a barra do drawer", () => {
    const onClose = vi.fn();
    render(<TagManagerDialog open categories={[]} onClose={onClose} onCategoriesChange={vi.fn()} />);
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

    expect(onClose).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveStyle({ transform: "translateY(120px)" });
  });
});
