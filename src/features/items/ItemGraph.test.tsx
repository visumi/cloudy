import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CloudyItem } from "../../types/api";
import { ItemGraph } from "./ItemGraph";

const item: CloudyItem = {
  id: "item-1",
  name: "Página de inspiração",
  url: "https://example.com/inspiration",
  imageUrl: null,
  faviconUrl: null,
  observation: "Uma referência para revisar depois.",
  category: { id: "category-1", name: "Ideias", color: "#A78BFA" },
  createdAt: "2026-09-11T00:00:00Z",
  updatedAt: "2026-09-11T00:00:00Z"
};

describe("ItemGraph drawer", () => {
  it("mantém fechar, copiar e abrir clicáveis depois de abrir um item", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(
      <ItemGraph items={[item]} isLoading={false} error={null} onRetry={() => undefined} onAddLink={() => undefined}>
        <div aria-hidden="true" />
      </ItemGraph>
    );

    await user.click(screen.getByRole("button", { name: "Página de inspiração, categoria Ideias" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "Copiar link" });
    await user.click(copyButton);
    expect(writeText).toHaveBeenCalledWith(item.url);
    expect(copyButton).toHaveAccessibleName("Link copiado");

    const referenceLink = screen.getByRole("link", { name: "Acessar" });
    expect(referenceLink).toHaveAttribute("href", item.url);
    await user.click(referenceLink);

    await user.click(screen.getByRole("button", { name: "Fechar detalhes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
