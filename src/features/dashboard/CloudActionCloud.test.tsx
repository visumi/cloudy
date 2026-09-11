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
});
