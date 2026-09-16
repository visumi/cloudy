import { describe, expect, it, vi } from "vitest";
import { extractDiscordUrls, handleDiscordInteraction } from "./discord";
import type { Env } from "./shared";

const baseEnv: Env = { TURSO_URL: "https://example.turso.io", TURSO_AUTH_TOKEN: "token", FIREBASE_PROJECT_ID: "cloudy", OWNER_EMAIL: "owner@example.com" };

describe("Discord interactions", () => {
  it("extrai URLs HTTP/HTTPS, remove pontuação e mantém links válidos", () => {
    expect(extractDiscordUrls("Veja <https://example.com/a>, https://example.org/b! ftp://invalid.test https://example.com/a")).toEqual([
      "https://example.com/a",
      "https://example.org/b"
    ]);
  });

  it("responde PING com PONG sem acessar o banco", async () => {
    const { body, headers } = await signedPayload({ type: 1 });
    const response = await handleDiscordInteraction(new Request("https://cloudy-api.isumi.com.br/integrations/discord/interactions", { method: "POST", headers, body }), { ...baseEnv, DISCORD_PUBLIC_KEY: headers.get("x-test-public-key")! }, undefined, {
      createDatabaseClient: vi.fn(() => { throw new Error("não deveria acessar o banco"); })
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ type: 1 });
  });

  it("responde imediatamente e agenda o processamento de um comando", async () => {
    const { body, headers } = await signedPayload({
      type: 2,
      application_id: "app-1",
      token: "interaction-token",
      context: 1,
      user: { id: "discord-1" },
      data: { type: 1, name: "cloudy", options: [{ type: 1, name: "status", options: [] }] }
    });
    const editResponse = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const scheduled: Promise<void>[] = [];
    const getDiscordConnection = vi.fn(async () => ({ discordUserId: "discord-1", userId: "user-1", shortcutTokenId: "token-1", createdAt: "now", lastUsedAt: null }));
    const response = await handleDiscordInteraction(new Request("https://cloudy-api.isumi.com.br/integrations/discord/interactions", { method: "POST", headers, body }), { ...baseEnv, DISCORD_PUBLIC_KEY: headers.get("x-test-public-key")! }, { waitUntil: (promise) => { scheduled.push(promise); } } as unknown as ExecutionContext, {
      createDatabaseClient: vi.fn(() => ({} as never)),
      getDiscordConnection
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ type: 5, data: { flags: 64 } });
    expect(scheduled).toHaveLength(1);
    await scheduled[0];
    expect(getDiscordConnection).toHaveBeenCalledWith(expect.anything(), "discord-1");
    editResponse.mockRestore();
  });
});

async function signedPayload(payload: unknown): Promise<{ body: string; headers: Headers }> {
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = toHex(new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey)));
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = toHex(new Uint8Array(await crypto.subtle.sign("Ed25519", keyPair.privateKey, new TextEncoder().encode(`${timestamp}${body}`))));
  const headers = new Headers({ "X-Signature-Ed25519": signature, "X-Signature-Timestamp": timestamp });
  headers.set("x-test-public-key", publicKey);
  return { body, headers };
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
