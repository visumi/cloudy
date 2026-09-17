import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import type { AccessUser } from "../../types/api";
import { AccessAdminDialog } from "./AccessAdminDialog";

vi.mock("../../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/api")>();
  return { ...original, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);
const owner: AccessUser = {
  email: "owner@example.com",
  role: "owner",
  active: true,
  createdAt: "2026-09-15 12:00:00",
  updatedAt: "2026-09-15 12:00:00",
  user: { uid: "owner-1", name: "Owner", picture: null, lastLoginAt: "2026-09-15 12:00:00" }
};
const member: AccessUser = {
  email: "member@example.com",
  role: "member",
  active: false,
  createdAt: "2026-09-15 12:00:00",
  updatedAt: "2026-09-15 12:00:00",
  user: null
};

describe("AccessAdminDialog", () => {
  beforeEach(() => mockedApiRequest.mockReset());

  it("carrega uma única vez ao abrir e apresenta a lista vazia", async () => {
    mockedApiRequest.mockResolvedValueOnce([]);
    const { rerender } = render(<AccessAdminDialog open={false} onClose={vi.fn()} />);

    expect(mockedApiRequest).not.toHaveBeenCalled();
    rerender(<AccessAdminDialog open onClose={vi.fn()} />);

    expect(await screen.findByText("Nenhum acesso cadastrado.")).toBeInTheDocument();
    expect(mockedApiRequest).toHaveBeenCalledTimes(1);
  });

  it("apresenta um loading contextual enquanto busca os acessos", () => {
    mockedApiRequest.mockReturnValueOnce(new Promise<never>(() => {}));
    render(<AccessAdminDialog open onClose={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando acessos");
    expect(screen.getByText("Buscando os usuários autorizados…")).toBeInTheDocument();
  });

  it("lista usuários sem badges e mantém o proprietário protegido", async () => {
    mockedApiRequest.mockResolvedValueOnce([member, owner]);
    render(<AccessAdminDialog open onClose={vi.fn()} />);

    expect(await screen.findByRole("switch", { name: "Acesso do proprietário protegido" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Ativar acesso de member@example.com" })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText("Proprietário")).not.toBeInTheDocument();
    expect(screen.queryByText("Inativo")).not.toBeInTheDocument();
  });

  it("exibe último login no horário de São Paulo", async () => {
    mockedApiRequest.mockResolvedValueOnce([owner]);
    render(<AccessAdminDialog open onClose={vi.fn()} />);

    expect(await screen.findByText("Último login: 15/09/2026, 09:00")).toBeInTheDocument();
  });

  it("mantém o botão de liberar acesso apenas com ícone e nome acessível", () => {
    mockedApiRequest.mockReturnValueOnce(new Promise<never>(() => {}));
    render(<AccessAdminDialog open onClose={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Liberar acesso" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button.querySelector("span")).toBeNull();
  });

  it("normaliza e libera um novo acesso", async () => {
    mockedApiRequest.mockResolvedValueOnce([owner]);
    mockedApiRequest.mockResolvedValueOnce({ ...member, active: true });
    render(<AccessAdminDialog open onClose={vi.fn()} />);
    await screen.findByRole("switch", { name: "Acesso do proprietário protegido" });

    fireEvent.change(screen.getByLabelText("E-mail da conta Google"), { target: { value: " Member@Example.COM " } });
    fireEvent.click(screen.getByRole("button", { name: "Liberar acesso" }));

    await waitFor(() => expect(mockedApiRequest).toHaveBeenLastCalledWith("/admin/access-users", expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "member@example.com" }) })));
    expect(await screen.findByText("Acesso liberado.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Desativar acesso de member@example.com" })).toBeInTheDocument();
  });

  it("ativa somente o membro escolhido", async () => {
    mockedApiRequest.mockResolvedValueOnce([owner, member]);
    mockedApiRequest.mockResolvedValueOnce({ ...member, active: true });
    render(<AccessAdminDialog open onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("switch", { name: "Ativar acesso de member@example.com" }));

    await waitFor(() => expect(mockedApiRequest).toHaveBeenLastCalledWith("/admin/access-users/member%40example.com", { method: "PATCH", body: JSON.stringify({ active: true }) }));
    expect(await screen.findByText("Acesso ativado.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Desativar acesso de member@example.com" })).toBeInTheDocument();
  });

  it("exclui um membro sem afetar o proprietário", async () => {
    mockedApiRequest.mockResolvedValueOnce([owner, member]);
    mockedApiRequest.mockResolvedValueOnce({ email: member.email });
    render(<AccessAdminDialog open onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Excluir acesso de member@example.com" }));

    await waitFor(() => expect(mockedApiRequest).toHaveBeenLastCalledWith("/admin/access-users/member%40example.com", { method: "DELETE" }));
    expect(await screen.findByText("Acesso excluído.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir acesso de member@example.com" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir acesso de owner@example.com" })).not.toBeInTheDocument();
  });

  it("valida o e-mail antes de chamar a API", async () => {
    mockedApiRequest.mockResolvedValueOnce([owner]);
    render(<AccessAdminDialog open onClose={vi.fn()} />);
    await screen.findByRole("switch", { name: "Acesso do proprietário protegido" });

    fireEvent.change(screen.getByLabelText("E-mail da conta Google"), { target: { value: "invalido" } });
    fireEvent.click(screen.getByRole("button", { name: "Liberar acesso" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Informe um e-mail válido.");
    expect(mockedApiRequest).toHaveBeenCalledTimes(1);
  });

  it("permite tentar novamente e fecha com Escape", async () => {
    mockedApiRequest.mockRejectedValueOnce(new Error("offline"));
    mockedApiRequest.mockResolvedValueOnce([owner]);
    const onClose = vi.fn();
    render(<AccessAdminDialog open onClose={onClose} />);

    fireEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("switch", { name: "Acesso do proprietário protegido" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("fecha ao clicar fora do painel", async () => {
    mockedApiRequest.mockResolvedValueOnce([owner]);
    const onClose = vi.fn();
    render(<AccessAdminDialog open onClose={onClose} />);
    await screen.findByRole("switch", { name: "Acesso do proprietário protegido" });

    fireEvent.mouseDown(document.querySelector(".access-admin-backdrop")!);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("fecha ao arrastar o handle do drawer para baixo", () => {
    mockedApiRequest.mockResolvedValueOnce([owner]);
    const onClose = vi.fn();
    render(<AccessAdminDialog open onClose={onClose} />);
    const handle = document.querySelector(".mobile-drawer-handle")!;
    const pointerEvent = (type: string, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: 100, clientY });
      Object.defineProperty(event, "pointerId", { value: 1 });
      Object.defineProperty(event, "pointerType", { value: "touch" });
      return event;
    };

    fireEvent(handle, pointerEvent("pointerdown", 100));
    fireEvent(handle, pointerEvent("pointermove", 220));
    fireEvent(handle, pointerEvent("pointerup", 220));

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toHaveStyle({ transform: "translateY(120px)" });
  });
});
