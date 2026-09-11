import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

vi.mock("../../hooks/use-auth", () => ({
  useAuth: () => ({ authError: null, signIn: vi.fn() })
}));

describe("LoginPage", () => {
  it("exibe a entrada Google e a mensagem de acesso", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /entrar com google/i })).toBeInTheDocument();
    expect(screen.getByText(/apenas para pessoas autorizadas/i)).toBeInTheDocument();
  });
});
