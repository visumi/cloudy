import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import type { CloudyItem } from "../../types/api";
import { ItemDialog } from "./ItemDialog";

vi.mock("../../lib/api", () => ({
  apiRequest: vi.fn()
}));

const mockedApiRequest = vi.mocked(apiRequest);

const createdItem: CloudyItem = {
  id: "item-1",
  name: "Página de inspiração",
  url: "https://example.com/inspiration",
  imageUrl: "https://example.com/image.jpg",
  faviconUrl: "https://example.com/favicon.ico",
  observation: null,
  category: { id: "category-1", name: "Ideias" },
  createdAt: "2026-09-11T00:00:00Z",
  updatedAt: "2026-09-11T00:00:00Z"
};

describe("ItemDialog", () => {
  it("preenche o nome com o título da prévia sem substituir edição manual", async () => {
    mockedApiRequest.mockResolvedValueOnce({ title: "Título extraído", imageUrl: "https://example.com/image.jpg", faviconUrl: "https://example.com/favicon.ico" });
    render(<ItemDialog open categoryNames={[]} onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Link"), { target: { value: "https://example.com" } });
    fireEvent.blur(screen.getByLabelText("Link"));
    await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue("Título extraído"));

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Meu nome" } });
    mockedApiRequest.mockResolvedValueOnce({ title: "Outro título", imageUrl: null, faviconUrl: null });
    fireEvent.blur(screen.getByLabelText("Link"));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(screen.getByLabelText("Nome")).toHaveValue("Meu nome");
  });

  it("salva o payload e devolve o item criado", async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    mockedApiRequest.mockResolvedValueOnce(createdItem);
    render(<ItemDialog open categoryNames={[]} onClose={onClose} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText("Link"), { target: { value: createdItem.url } });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: createdItem.name } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "Ideias" } });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdItem));
    expect(onClose).toHaveBeenCalled();
    expect(mockedApiRequest).toHaveBeenCalledWith("/items", expect.objectContaining({ method: "POST" }));
  });

  it("fecha ao arrastar a barra do drawer", () => {
    const onClose = vi.fn();
    render(<ItemDialog open categoryNames={[]} onClose={onClose} onCreated={vi.fn()} />);
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
