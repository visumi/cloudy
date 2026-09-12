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
    render(<ItemDialog open categoryOptions={[{ id: "category-1", name: "Inspirações", color: "#A78BFA" }]} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Criar item" })).toBeInTheDocument();
    expect(screen.getByText("Preencha os dados abaixo")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nome do item")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toHaveAttribute("maxLength", "24");
    expect(screen.getByLabelText(/Link/)).not.toBeRequired();
    expect(screen.getByText("0/2048", { selector: ".field-character-count" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vazio" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Vazio", { selector: ".item-live-preview-category > span:last-child" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Categoria")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Meu card" } });
    fireEvent.change(screen.getByLabelText(/Link/), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspirações" }));
    fireEvent.change(screen.getByLabelText(/Observação/), { target: { value: "Uma nota curta" } });

    expect(screen.getByLabelText("Nome")).toHaveValue("Meu card");
    expect(screen.getByText("19/2048", { selector: ".field-character-count" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
    expect(screen.getByText("Inspirações", { selector: ".item-live-preview-category > span:last-child" })).toBeInTheDocument();
    expect(screen.getByLabelText("Observação (opcional)")).toHaveValue("Uma nota curta");
  });

  it("permite salvar um item sem tag", async () => {
    const onCreated = vi.fn();
    mockedApiRequest.mockResolvedValueOnce({ ...createdItem, category: null });
    render(<ItemDialog open categoryOptions={[{ id: "category-1", name: "Ideias", color: "#A78BFA" }]} onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Meu item" } });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ category: null })));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("preenche o nome com o título da prévia sem substituir edição manual", async () => {
    mockedApiRequest.mockResolvedValueOnce({ title: "Título extraído", imageUrl: "https://example.com/image.jpg", faviconUrl: "https://example.com/favicon.ico" });
    render(<ItemDialog open categoryOptions={[]} onClose={vi.fn()} onCreated={vi.fn()} />);

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
    const onCreated = vi.fn();
    const onClose = vi.fn();
    mockedApiRequest.mockResolvedValueOnce(createdItem);
    render(<ItemDialog open categoryOptions={[{ id: "category-1", name: "Ideias", color: "#A78BFA" }]} onClose={onClose} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText(/Link/), { target: { value: createdItem.url } });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: createdItem.name } });
    fireEvent.click(screen.getByRole("button", { name: "Ideias" }));
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdItem));
    expect(onClose).toHaveBeenCalled();
    expect(mockedApiRequest).toHaveBeenCalledWith("/items", expect.objectContaining({ method: "POST" }));
  });

  it("salva um item sem enviar URL", async () => {
    const onCreated = vi.fn();
    mockedApiRequest.mockResolvedValueOnce({ ...createdItem, url: null });
    render(<ItemDialog open categoryOptions={[{ id: "category-1", name: "Ideias", color: "#38BDF8" }]} onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Só uma ideia" } });
    fireEvent.click(screen.getByRole("button", { name: "Ideias" }));
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ url: null })));
    expect(mockedApiRequest).toHaveBeenCalledWith("/items", expect.objectContaining({ body: JSON.stringify({ name: "Só uma ideia", url: undefined, categoryName: "Ideias", categoryColor: "#38BDF8", observation: undefined }) }));
  });

  it("fecha ao arrastar a barra do drawer", () => {
    const onClose = vi.fn();
    render(<ItemDialog open categoryOptions={[]} onClose={onClose} onCreated={vi.fn()} />);
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

  it("seleciona uma categoria existente sem exibir editor ou paleta de cores", () => {
    render(<ItemDialog open categoryOptions={[{ id: "category-1", name: "Ideias", color: "#A78BFA" }]} onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Ideias" }));
    expect(screen.getByText("Ideias", { selector: ".item-live-preview-category > span:last-child" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nova tag" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Escolha a cor da categoria" })).not.toBeInTheDocument();
  });
});
