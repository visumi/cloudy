import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
