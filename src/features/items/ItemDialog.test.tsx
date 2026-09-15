import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import type { CloudyItem } from "../../types/api";
import { ItemDialog } from "./ItemDialog";

vi.mock("../../lib/api", () => ({
  apiRequest: vi.fn()
}));

const mockedApiRequest = vi.mocked(apiRequest);

beforeEach(() => {
  mockedApiRequest.mockReset();
});

const createdItem: CloudyItem = {
  id: "item-1",
  name: "Página de inspiração",
  url: "https://example.com/inspiration",
  imageUrl: "https://example.com/image.jpg",
  faviconUrl: "https://example.com/favicon.ico",
  observation: null,
  category: { id: "category-1", name: "Ideias", color: "#A78BFA" },
  createdAt: "2026-09-11T00:00:00Z",
  updatedAt: "2026-09-11T00:00:00Z"
};

describe("ItemDialog", () => {
  it("atualiza a prévia do card conforme as informações são preenchidas", () => {
    render(<ItemDialog open categoryOptions={[{ id: "category-1", name: "Inspirações", color: "#A78BFA" }]} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(document.querySelector(".modal-heading .modal-heading-icon")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Criar item" })).toBeInTheDocument();
    expect(screen.getByText("Preencha os dados abaixo")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nome do item")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toHaveAttribute("maxLength", "24");
    expect(screen.getByLabelText(/Link/)).not.toBeRequired();
    expect(screen.getByText("0/2048", { selector: ".field-character-count" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vazio" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Vazio", { selector: ".item-live-preview-category > span:last-child" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Coleção")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Meu card" } });
    fireEvent.change(screen.getByLabelText(/Link/), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspirações" }));
    fireEvent.change(screen.getByLabelText(/Observação/), { target: { value: "Uma nota curta" } });

    expect(screen.getByLabelText("Nome")).toHaveValue("Meu card");
    expect(screen.getByText("19/2048", { selector: ".field-character-count" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
    expect(screen.getByText("Inspirações", { selector: ".item-live-preview-category > span:last-child" })).toBeInTheDocument();
    expect(screen.getByLabelText("Observação (opcional)")).toHaveValue("Uma nota curta");
    expect(screen.getByLabelText("Observação (opcional)")).toHaveAttribute("maxLength", "120");
  });

  it("permite salvar um item sem coleção", async () => {
    const onSaved = vi.fn();
    mockedApiRequest.mockResolvedValueOnce({ ...createdItem, category: null });
    render(<ItemDialog open categoryOptions={[{ id: "category-1", name: "Ideias", color: "#A78BFA" }]} onClose={vi.fn()} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Meu item" } });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ category: null }), null));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("preenche o nome com o título da prévia sem substituir edição manual", async () => {
    mockedApiRequest.mockResolvedValueOnce({ title: "Título extraído", imageUrl: "https://example.com/image.jpg", faviconUrl: "https://example.com/favicon.ico" });
    render(<ItemDialog open categoryOptions={[]} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Link/), { target: { value: "https://example.com" } });
    fireEvent.blur(screen.getByLabelText(/Link/));
    await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue("Título extraído"));

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Meu nome" } });
    mockedApiRequest.mockResolvedValueOnce({ title: "Outro título", imageUrl: null, faviconUrl: null });
    fireEvent.blur(screen.getByLabelText(/Link/));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(screen.getByLabelText("Nome")).toHaveValue("Meu nome");
  });

  it("salva o payload e devolve o item criado", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    mockedApiRequest.mockResolvedValueOnce(createdItem);
    render(<ItemDialog open categoryOptions={[{ id: "category-1", name: "Ideias", color: "#A78BFA" }]} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/Link/), { target: { value: createdItem.url } });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: createdItem.name } });
    fireEvent.click(screen.getByRole("button", { name: "Ideias" }));
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(createdItem, null));
    expect(onClose).toHaveBeenCalled();
    expect(mockedApiRequest).toHaveBeenCalledWith("/items", expect.objectContaining({ method: "POST" }));
  });

  it("salva um item sem enviar URL", async () => {
    const onSaved = vi.fn();
    mockedApiRequest.mockResolvedValueOnce({ ...createdItem, url: null });
    render(<ItemDialog open categoryOptions={[{ id: "category-1", name: "Ideias", color: "#38BDF8" }]} onClose={vi.fn()} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Só uma ideia" } });
    fireEvent.click(screen.getByRole("button", { name: "Ideias" }));
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ url: null }), null));
    expect(mockedApiRequest).toHaveBeenCalledWith("/items", expect.objectContaining({ body: JSON.stringify({ name: "Só uma ideia", url: undefined, categoryName: "Ideias", categoryColor: "#38BDF8", observation: undefined }) }));
  });

  it("fecha ao arrastar a barra do drawer", () => {
    const onClose = vi.fn();
    render(<ItemDialog open categoryOptions={[]} onClose={onClose} onSaved={vi.fn()} />);
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

  it("seleciona uma coleção existente sem exibir editor ou paleta de cores", () => {
    render(<ItemDialog open categoryOptions={[{ id: "category-1", name: "Ideias", color: "#A78BFA" }]} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Ideias" }));
    expect(screen.getByText("Ideias", { selector: ".item-live-preview-category > span:last-child" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nova coleção" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Escolha a cor da coleção" })).not.toBeInTheDocument();
  });

  it("reaproveita o formulário preenchido e envia a edição por PATCH", async () => {
    const onSaved = vi.fn();
    const updatedItem = { ...createdItem, name: "Página revisada", observation: "Revisar amanhã", updatedAt: "2026-09-15T00:00:00Z" };
    mockedApiRequest.mockResolvedValueOnce(updatedItem);
    render(<ItemDialog open item={createdItem} categoryOptions={[createdItem.category!]} onClose={vi.fn()} onSaved={onSaved} />);

    expect(screen.getByRole("heading", { name: "Editar item" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toHaveValue(createdItem.name);
    expect(screen.getByLabelText(/Link/)).toHaveValue(createdItem.url);
    expect(screen.getByRole("button", { name: "Ideias" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: updatedItem.name } });
    fireEvent.change(screen.getByLabelText(/Observação/), { target: { value: updatedItem.observation } });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updatedItem, createdItem));
    expect(mockedApiRequest).toHaveBeenCalledWith("/items/item-1", {
      method: "PATCH",
      body: JSON.stringify({ name: updatedItem.name, url: createdItem.url, categoryId: "category-1", observation: updatedItem.observation })
    });
  });

  it("permite mover um item de Integrações para Vazio", async () => {
    const integrationItem = { ...createdItem, category: { id: "__integrations__", name: "Integrações", color: "#38BDF8" } };
    mockedApiRequest.mockResolvedValueOnce({ ...integrationItem, category: null });
    render(<ItemDialog open item={integrationItem} categoryOptions={[]} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Integrações" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vazio" }));
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/items/item-1", expect.objectContaining({
      body: JSON.stringify({ name: createdItem.name, url: createdItem.url, categoryId: null, observation: null })
    })));
  });
});
