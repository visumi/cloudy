import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import { CloudyShell } from "./CloudyShell";

vi.mock("../../lib/api", () => ({ apiBaseUrl: "https://cloudy-api.isumi.com.br", apiRequest: vi.fn() }));
vi.mock("../../hooks/use-auth", () => ({
  useAuth: () => ({
    profile: { name: "Ana Souza", email: "ana@example.com", picture: null },
    signOutUser: vi.fn().mockResolvedValue(undefined),
    user: { email: "ana@example.com", photoURL: null }
  })
}));
vi.mock("./CloudMascot", () => ({ CloudMascot: () => <div aria-hidden="true" /> }));
vi.mock("../items/ItemGraph", () => ({
  FallbackImage: ({ alt, className }: { alt: string; className: string }) => <img alt={alt} className={className} />,
  ItemGraph: ({ children, categories, items, onCategorySelect, onItemSelect }: { children: ReactNode; categories?: Array<{ id: string; name: string; itemCount: number; recentItems: Array<{ name: string }> }>; items?: Array<{ id: string; name: string; url?: string; imageUrl?: null; faviconUrl?: null; observation?: null; category?: { id: string; name: string; color: string } | null; createdAt?: string; updatedAt?: string }>; onCategorySelect?: (id: string) => void; onItemSelect?: (item: { id: string; name: string; url: string; imageUrl: null; faviconUrl: null; observation: null; category: { id: string; name: string; color: string } | null; createdAt: string; updatedAt: string }) => void }) => (
    <div>
      {children}
      <ul aria-label="Coleções no grafo">{categories?.map((category) => <li key={category.id}>{category.name}: {category.itemCount} {category.itemCount === 1 ? "item" : "itens"}; recentes: {category.recentItems.map((item) => item.name).join(", ")}</li>)}</ul>
      <ul aria-label="Itens no grafo">{items?.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
      {items?.map((item) => <button key={`open-${item.id}`} type="button" onClick={() => onItemSelect?.({ url: "https://example.com/item", imageUrl: null, faviconUrl: null, observation: null, category: null, createdAt: "2026-09-13T15:00:00.000Z", updatedAt: "2026-09-13T15:00:00.000Z", ...item })}>Abrir item {item.name}</button>)}
      {categories?.[0] && <button type="button" onClick={() => onCategorySelect?.(categories[0].id)}>Abrir coleção {categories[0].name}</button>}
      <button type="button" onClick={() => onItemSelect?.({ id: "item-detail", name: "Item detalhado", url: "https://example.com/detail", imageUrl: null, faviconUrl: null, observation: null, category: null, createdAt: "2026-09-13T15:00:00.000Z", updatedAt: "2026-09-13T15:00:00.000Z" })}>Abrir detalhe</button>
    </div>
  ),
  ItemDetail: ({ item, open, onClose, onExited, onEdit, onDelete }: { item: { name: string }; open: boolean; onClose: () => void; onExited: () => void; onEdit: (item: never) => void; onDelete: (item: never) => void }) => {
    if (!open) {
      window.setTimeout(onExited, 0);
      return null;
    }
    return <div role="dialog" aria-label={`Detalhe de ${item.name}`}>
      <button type="button" onClick={onClose}>Fechar detalhe</button>
      <button type="button" onClick={() => onEdit(item as never)}>Editar detalhe</button>
      <button type="button" onClick={() => onDelete(item as never)}>Excluir detalhe</button>
    </div>;
  }
}));
vi.mock("../items/ItemDialog", () => ({
  ItemDialog: ({ open, item, onClose, onSaved, onClosingChange }: { open: boolean; item?: { id: string; name: string; url: string; imageUrl: string | null; faviconUrl: string | null; observation: null; category: { id: string; name: string; color: string } | null; createdAt: string; updatedAt: string } | null; onClose: () => void; onSaved: (savedItem: { id: string; name: string; url: string; imageUrl: string; faviconUrl: string; observation: null; category: { id: string; name: string; color: string } | null; createdAt: string; updatedAt: string }, previousItem: typeof item) => void; onClosingChange?: (closing: boolean) => void }) => open ? <div role="dialog">
    <button type="button" onClick={() => { onSaved({ id: "created-item", name: "Item recém-criado", url: "https://example.com/new", imageUrl: "https://example.com/new.jpg", faviconUrl: "https://example.com/favicon.ico", observation: null, category: { id: "category-1", name: "Ideias", color: "#A78BFA" }, createdAt: "2026-09-13T18:00:00.000Z", updatedAt: "2026-09-13T18:00:00.000Z" }, null); onClose(); }}>Salvar item de teste</button>
    <button type="button" onClick={() => { onSaved({ id: "untagged-item", name: "Item sem coleção", url: "https://example.com/empty", imageUrl: "https://example.com/empty.jpg", faviconUrl: "https://example.com/favicon.ico", observation: null, category: null, createdAt: "2026-09-13T19:00:00.000Z", updatedAt: "2026-09-13T19:00:00.000Z" }, null); onClose(); }}>Salvar item sem coleção</button>
    {item && <button type="button" onClick={() => { onSaved({ ...item, name: "Item atualizado", imageUrl: item.imageUrl ?? "", faviconUrl: item.faviconUrl ?? "", updatedAt: "2026-09-15T12:00:00.000Z" }, item); onClosingChange?.(true); onClose(); window.setTimeout(() => onClosingChange?.(false), 0); }}>Salvar edição de teste</button>}
    {item && <button type="button" onClick={() => { onSaved({ ...item, name: "Item movido", imageUrl: item.imageUrl ?? "", faviconUrl: item.faviconUrl ?? "", category: null, updatedAt: "2026-09-15T12:00:00.000Z" }, item); onClosingChange?.(true); onClose(); window.setTimeout(() => onClosingChange?.(false), 0); }}>Mover edição para Vazio</button>}
    <button type="button" onClick={() => { onClosingChange?.(true); onClose(); window.setTimeout(() => onClosingChange?.(false), 220); }}>Fechar</button>
  </div> : null
}));
vi.mock("../items/ItemDeleteDialog", () => ({
  ItemDeleteDialog: ({ open, item, onClose, onDeleted, onClosingChange }: { open: boolean; item?: { name: string } | null; onClose: () => void; onDeleted: (item: never) => void; onClosingChange?: (closing: boolean) => void }) => open && item ? <div role="alertdialog" aria-label="Excluir item">
    <span>{item.name}</span>
    <button type="button" onClick={() => { onClosingChange?.(true); onClose(); window.setTimeout(() => onClosingChange?.(false), 0); }}>Cancelar exclusão</button>
    <button type="button" onClick={() => { onDeleted(item as never); onClosingChange?.(true); onClose(); window.setTimeout(() => onClosingChange?.(false), 0); }}>Confirmar exclusão</button>
  </div> : null
}));

const mockedApiRequest = vi.mocked(apiRequest);

beforeEach(() => { mockedApiRequest.mockReset(); });

describe("CloudyShell", () => {
  it("mantém o dock visível mesmo após inatividade", () => {
    vi.useFakeTimers();
    try {
      mockedApiRequest.mockResolvedValueOnce({ categories: [] });
      const { container } = render(<CloudyShell />);
      const dock = container.querySelector<HTMLElement>(".action-cloud-dock")!;

      act(() => vi.advanceTimersByTime(5000));

      expect(dock).not.toHaveClass("action-cloud-dock--hidden");
      expect(dock).toHaveAttribute("aria-hidden", "false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("oculta o dock enquanto o drawer de adicionar link está aberto", async () => {
    mockedApiRequest.mockResolvedValueOnce({ categories: [] });
    const { container } = render(<CloudyShell />);
    const dock = container.querySelector<HTMLElement>(".action-cloud-dock")!;
    const searchTrigger = container.querySelector<HTMLElement>(".global-search-trigger")!;

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/categories"));
    expect(mockedApiRequest).not.toHaveBeenCalledWith("/items");
    fireEvent.click(screen.getByRole("button", { name: "Adicionar referência" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(dock).toHaveClass("action-cloud-dock--hidden");
    expect(dock).toHaveAttribute("aria-hidden", "true");
    expect(dock).toContainElement(searchTrigger);
    expect(searchTrigger).toBeDisabled();
    expect(container.querySelector("main")).toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(dock).toHaveClass("action-cloud-dock--hidden");
    await waitFor(() => {
      expect(dock).not.toHaveClass("action-cloud-dock--hidden");
      expect(dock).toHaveAttribute("aria-hidden", "false");
      expect(searchTrigger).not.toBeDisabled();
      expect(container.querySelector("main")).not.toHaveAttribute("inert");
    });
  });

  it("carrega itens somente depois de abrir uma coleção", async () => {
    mockedApiRequest.mockResolvedValueOnce({ categories: [{ id: "category-1", name: "Ideias", color: "#A78BFA", itemCount: 1, recentItems: [] }] });
    mockedApiRequest.mockResolvedValueOnce({ items: [{ id: "item-1" }] });
    render(<CloudyShell />);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/categories"));
    expect(mockedApiRequest).not.toHaveBeenCalledWith("/items");
    fireEvent.click(screen.getByRole("button", { name: "Abrir coleção Ideias" }));
    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/categories/category-1/items"));
  });

  it("insere o item criado no card e preserva a atualização se a revalidação falhar", async () => {
    mockedApiRequest.mockResolvedValueOnce({ categories: [{ id: "category-1", name: "Ideias", color: "#A78BFA", itemCount: 0, recentItems: [] }] });
    mockedApiRequest.mockRejectedValueOnce(new Error("offline"));
    render(<CloudyShell />);

    await waitFor(() => expect(screen.getByText("Ideias: 0 itens; recentes:")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Adicionar referência" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar item de teste" }));

    await waitFor(() => expect(screen.getByText("Ideias: 1 item; recentes: Item recém-criado")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Referência salva na sua nuvem.");
  });

  it("insere o item imediatamente na coleção aberta sem exibir loading durante a revalidação", async () => {
    let resolveCategoryRefresh!: (value: { items: never[] }) => void;
    const categoryRefresh = new Promise<{ items: never[] }>((resolve) => { resolveCategoryRefresh = resolve; });
    mockedApiRequest.mockImplementation((path) => {
      if (path === "/categories") {
        const categoryCalls = mockedApiRequest.mock.calls.filter(([calledPath]) => calledPath === "/categories").length;
        return Promise.resolve({ categories: [{ id: "category-1", name: "Ideias", color: "#A78BFA", itemCount: categoryCalls > 1 ? 1 : 0, recentItems: [] }] });
      }
      if (path === "/categories/category-1/items") {
        const itemCalls = mockedApiRequest.mock.calls.filter(([calledPath]) => calledPath === "/categories/category-1/items").length;
        return itemCalls > 1 ? categoryRefresh : Promise.resolve({ items: [] });
      }
      return Promise.resolve({ items: [] });
    });
    render(<CloudyShell />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Abrir coleção Ideias" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Abrir coleção Ideias" }));
    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/categories/category-1/items"));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar referência" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar item de teste" }));

    expect(await screen.findByText("Item recém-criado", { selector: "[aria-label='Itens no grafo'] li" })).toBeInTheDocument();
    expect(screen.queryByText("Abrindo suas coleções...")).not.toBeInTheDocument();

    await act(async () => { resolveCategoryRefresh({ items: [] }); });
    expect(screen.getByText("Item recém-criado", { selector: "[aria-label='Itens no grafo'] li" })).toBeInTheDocument();
  });

  it("cria e atualiza o card Vazio para itens sem coleção", async () => {
    mockedApiRequest.mockResolvedValueOnce({ categories: [] });
    mockedApiRequest.mockRejectedValueOnce(new Error("offline"));
    render(<CloudyShell />);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/categories"));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar referência" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar item sem coleção" }));

    expect(await screen.findByText("Vazio: 1 item; recentes: Item sem coleção")).toBeInTheDocument();
  });

  it("mantém a busca carregada sincronizada com o item criado", async () => {
    mockedApiRequest.mockImplementation((path) => {
      if (path === "/categories") return Promise.resolve({ categories: [{ id: "category-1", name: "Ideias", color: "#A78BFA", itemCount: 0, recentItems: [] }] });
      if (path === "/items") {
        const itemCalls = mockedApiRequest.mock.calls.filter(([calledPath]) => calledPath === "/items").length;
        return itemCalls > 1 ? Promise.reject(new Error("offline")) : Promise.resolve({ items: [] });
      }
      return Promise.resolve({ items: [] });
    });
    render(<CloudyShell />);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/categories"));
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/items"));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar referência" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar item de teste" }));
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    expect(await screen.findByText("Item recém-criado", { selector: ".command-result-copy strong" })).toBeInTheDocument();
  });

  it("abre a busca global com Ctrl+K e carrega itens somente na primeira abertura", async () => {
    mockedApiRequest.mockResolvedValueOnce({ categories: [] });
    mockedApiRequest.mockResolvedValueOnce({ items: [{ id: "item-1", name: "Casa", createdAt: "2026-09-13T15:00:00.000Z" }] });
    render(<CloudyShell />);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/categories"));
    expect(mockedApiRequest).not.toHaveBeenCalledWith("/items");
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Encontrar na nuvem" })).toBeInTheDocument());
    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/items"));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(mockedApiRequest).toHaveBeenCalledTimes(2);
  });

  it("oculta o dock enquanto o detalhe de um item está aberto", async () => {
    mockedApiRequest.mockResolvedValueOnce({ categories: [] });
    const { container } = render(<CloudyShell />);
    const dock = container.querySelector(".action-cloud-dock")!;

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/categories"));
    fireEvent.click(screen.getByRole("button", { name: "Abrir detalhe" }));

    expect(dock).toHaveClass("action-cloud-dock--hidden");
    expect(dock).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("main")).toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Fechar detalhe" }));
    await waitFor(() => {
      expect(dock).not.toHaveClass("action-cloud-dock--hidden");
      expect(dock).toHaveAttribute("aria-hidden", "false");
      expect(container.querySelector("main")).not.toHaveAttribute("inert");
    });
  });

  it("abre a edição após fechar o detalhe e retorna ao detalhe atualizado", async () => {
    mockedApiRequest.mockResolvedValueOnce({ categories: [] });
    render(<CloudyShell />);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/categories"));
    fireEvent.click(screen.getByRole("button", { name: "Abrir detalhe" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar detalhe" }));

    expect(await screen.findByRole("button", { name: "Salvar edição de teste" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Detalhe de Item detalhado" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar edição de teste" }));

    expect(await screen.findByRole("dialog", { name: "Detalhe de Item atualizado" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Item atualizado na sua nuvem.");
  });

  it("retorna ao detalhe ao cancelar a exclusão e remove o item ao confirmar", async () => {
    mockedApiRequest.mockResolvedValueOnce({ categories: [] });
    render(<CloudyShell />);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/categories"));
    fireEvent.click(screen.getByRole("button", { name: "Abrir detalhe" }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir detalhe" }));
    expect(await screen.findByRole("alertdialog", { name: "Excluir item" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar exclusão" }));
    expect(await screen.findByRole("dialog", { name: "Detalhe de Item detalhado" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Excluir detalhe" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog", { name: "Excluir item" })).not.toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: "Detalhe de Item detalhado" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Item excluído da sua nuvem.");
  });

  it("reconcilia movimento para Vazio e exclusão sem aguardar a revalidação", async () => {
    let categoryCalls = 0;
    let itemCalls = 0;
    const never = new Promise(() => undefined);
    mockedApiRequest.mockImplementation((path) => {
      if (path === "/categories") {
        categoryCalls += 1;
        return categoryCalls === 1
          ? Promise.resolve({ categories: [{ id: "category-1", name: "Ideias", color: "#A78BFA", itemCount: 1, recentItems: [{ id: "item-1", name: "Original", imageUrl: null, faviconUrl: null, createdAt: "2026-09-13T15:00:00.000Z" }] }] })
          : never;
      }
      if (path === "/categories/category-1/items") {
        itemCalls += 1;
        return itemCalls === 1
          ? Promise.resolve({ items: [{ id: "item-1", name: "Original", url: "https://example.com/item", imageUrl: null, faviconUrl: null, observation: null, category: { id: "category-1", name: "Ideias", color: "#A78BFA" }, createdAt: "2026-09-13T15:00:00.000Z", updatedAt: "2026-09-13T15:00:00.000Z" }] })
          : never;
      }
      return never;
    });
    render(<CloudyShell />);

    fireEvent.click(await screen.findByRole("button", { name: "Abrir coleção Ideias" }));
    fireEvent.click(await screen.findByRole("button", { name: "Abrir item Original" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar detalhe" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mover edição para Vazio" }));

    expect(await screen.findByText("Ideias: 0 itens; recentes:")).toBeInTheDocument();
    expect(screen.getByText("Vazio: 1 item; recentes: Item movido")).toBeInTheDocument();
    expect(screen.queryByText("Item movido", { selector: "[aria-label='Itens no grafo'] li" })).not.toBeInTheDocument();

    fireEvent.click(within(await screen.findByRole("dialog", { name: "Detalhe de Item movido" })).getByRole("button", { name: "Excluir detalhe" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar exclusão" }));

    await waitFor(() => expect(screen.queryByText(/Vazio: 1 item/)).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Item excluído da sua nuvem.");
  });
});
