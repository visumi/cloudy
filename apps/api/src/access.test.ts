import { describe, expect, it } from "vitest";
import { getOwnerEmails, normalizeEmail, resolveAccessDecision } from "./access";

describe("access policy", () => {
  const env = { OWNER_EMAIL: "Owner@Example.com, second@example.com" };
  it("normaliza e-mails e remove duplicados", () => expect(getOwnerEmails({ OWNER_EMAIL: " Owner@Example.com, owner@example.com " })).toEqual(["owner@example.com"]));
  it("autoriza o owner configurado", () => expect(resolveAccessDecision("owner@example.com", null, env)).toEqual({ allowed: true, role: "owner" }));
  it("autoriza grant ativo e bloqueia grant inativo", () => {
    expect(resolveAccessDecision("member@example.com", { role: "member", active: 1 }, env)).toEqual({ allowed: true, role: "member" });
    expect(resolveAccessDecision("member@example.com", { role: "member", active: 0 }, env)).toEqual({ allowed: false, role: null });
  });
  it("normaliza um e-mail individual", () => expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com"));
});
