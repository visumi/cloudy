import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import packageJson from "../../../package.json";
import { CloudActionCloud } from "./CloudActionCloud";

describe("CloudActionCloud", () => {
  it("exibe marca, versão, nome do perfil e email formatado", () => {
    render(<CloudActionCloud name="Ana Souza" email="ana.souza@example.com" />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir configurações" }));

    expect(screen.getByText("cloudy")).toBeInTheDocument();
    expect(screen.getByText(packageJson.version)).toBeInTheDocument();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("ana.souza")).toBeInTheDocument();
  });

  it("abre diretamente o cadastro ao clicar no botão de adicionar", () => {
    const onAddLink = vi.fn();
    render(<CloudActionCloud onAddLink={onAddLink} />);

    const addButton = screen.getByRole("button", { name: "Adicionar referência" });
    fireEvent.click(addButton);

    expect(onAddLink).toHaveBeenCalledOnce();
    expect(addButton).not.toHaveAttribute("aria-haspopup");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("mantém a busca no mesmo bloco de ações", () => {
    const onSearch = vi.fn();
    const { container } = render(<CloudActionCloud onSearch={onSearch} />);

    const searchButton = screen.getByRole("button", { name: "Abrir busca global" });
    expect(container.querySelector(".action-cloud")).toContainElement(searchButton);
    fireEvent.click(searchButton);

    expect(onSearch).toHaveBeenCalledOnce();
  });

  it("abre diretamente o compartilhamento", () => {
    const onShareOpen = vi.fn();
    render(<CloudActionCloud onShareOpen={onShareOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Compartilhar" }));
    expect(onShareOpen).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("mantém Integrações no menu para configurar o token", () => {
    const onIntegrationsOpen = vi.fn();
    render(<CloudActionCloud onIntegrationsOpen={onIntegrationsOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir configurações" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Integrações" }));

    expect(onIntegrationsOpen).toHaveBeenCalledOnce();
  });
});
