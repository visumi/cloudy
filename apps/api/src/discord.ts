import type { Client } from "@libsql/client/web";
import { connectDiscord, disconnectDiscord, getDiscordConnection, touchDiscordConnection, type DiscordConnection } from "./discord-connections";
import { createIntegrationItem, type IntegrationItemResult } from "./items";
import { authenticateShortcutToken } from "./integration-tokens";
import { createDatabaseClient, type Env, HttpError } from "./shared";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_INTERACTION_PING = 1;
const DISCORD_APPLICATION_COMMAND = 2;
const DISCORD_MESSAGE_COMMAND = 3;
const DISCORD_CHAT_INPUT_COMMAND = 1;
const DISCORD_DEFERRED_RESPONSE = 5;
const DISCORD_EPHEMERAL = 1 << 6;
const DISCORD_BOT_DM_CONTEXT = 1;
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;
const MAX_MESSAGE_URLS = 5;
const URL_PATTERN = /https?:\/\/[^\s<>()]+/gi;

interface DiscordUser { id: string; }
interface DiscordMessage { content?: string; }
interface DiscordOption { name: string; type: number; value?: string; options?: DiscordOption[]; }
interface DiscordInteraction {
  type: number;
  application_id: string;
  token: string;
  context?: number;
  user?: DiscordUser;
  member?: { user?: DiscordUser };
  data?: {
    name?: string;
    type?: number;
    options?: DiscordOption[];
    target_id?: string;
    resolved?: { messages?: Record<string, DiscordMessage> };
  };
}

interface DiscordDependencies {
  createDatabaseClient: typeof createDatabaseClient;
  authenticateShortcutToken: typeof authenticateShortcutToken;
  createIntegrationItem: typeof createIntegrationItem;
  connectDiscord: typeof connectDiscord;
  getDiscordConnection: typeof getDiscordConnection;
  touchDiscordConnection: typeof touchDiscordConnection;
  disconnectDiscord: typeof disconnectDiscord;
}

const defaultDependencies: DiscordDependencies = {
  createDatabaseClient,
  authenticateShortcutToken,
  createIntegrationItem,
  connectDiscord,
  getDiscordConnection,
  touchDiscordConnection,
  disconnectDiscord
};

export async function handleDiscordInteraction(
  request: Request,
  env: Env,
  ctx: ExecutionContext | undefined,
  dependencies: Partial<DiscordDependencies> = {}
): Promise<Response> {
  const body = await request.text();
  if (!await verifyDiscordSignature(body, request.headers.get("X-Signature-Ed25519"), request.headers.get("X-Signature-Timestamp"), env.DISCORD_PUBLIC_KEY)) {
    return discordJson({ error: "invalid_discord_signature" }, 401);
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch {
    return discordJson({ error: "invalid_json" }, 400);
  }

  if (interaction.type === DISCORD_INTERACTION_PING) return discordJson({ type: 1 }, 200);
  if (interaction.type !== DISCORD_APPLICATION_COMMAND || !interaction.data?.name || !interaction.application_id || !interaction.token) {
    return discordJson({ error: "unsupported_discord_interaction" }, 400);
  }

  const mergedDependencies = { ...defaultDependencies, ...dependencies };
  const work = runDiscordCommand(interaction, env, mergedDependencies).catch(async (error) => {
    console.error(JSON.stringify({ event: "discord_command_failed", command: interaction.data?.name, error: error instanceof Error ? error.message : "unknown_error" }));
    try {
      await editOriginalResponse(interaction, formatDiscordError(error));
    } catch (responseError) {
      console.error(JSON.stringify({ event: "discord_response_failed", command: interaction.data?.name, error: responseError instanceof Error ? responseError.message : "unknown_error" }));
    }
  });
  if (ctx) ctx.waitUntil(work);
  else void work;
  return discordJson({ type: DISCORD_DEFERRED_RESPONSE, data: { flags: DISCORD_EPHEMERAL } }, 200);
}

async function runDiscordCommand(interaction: DiscordInteraction, env: Env, dependencies: DiscordDependencies): Promise<void> {
  const db = dependencies.createDatabaseClient(env);
  const command = interaction.data!;
  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!discordUserId) throw new HttpError(400, "discord_user_missing");

  if (command.type === DISCORD_MESSAGE_COMMAND && command.name === "Salvar no Cloudy") {
    await saveMessageLinks(interaction, discordUserId, db, dependencies);
    return;
  }
  if (command.type !== DISCORD_CHAT_INPUT_COMMAND || command.name !== "cloudy") {
    await editOriginalResponse(interaction, "Comando não reconhecido.");
    return;
  }

  const subcommand = readSubcommand(command.options);
  if (!subcommand) {
    await editOriginalResponse(interaction, "Escolha uma ação: conectar, salvar, status ou desconectar.");
    return;
  }

  if (subcommand.name === "conectar") {
    if (interaction.context !== DISCORD_BOT_DM_CONTEXT) {
      await editOriginalResponse(interaction, "Por segurança, informe o token em uma DM com o Cloudy.");
      return;
    }
    const token = readOptionValue(subcommand.options, "token");
    const identity = await dependencies.authenticateShortcutToken(db, token);
    await dependencies.connectDiscord(db, discordUserId, identity.userId, identity.id);
    await editOriginalResponse(interaction, "Discord conectado ao Cloudy. Agora você já pode usar /cloudy salvar.");
    return;
  }

  if (subcommand.name === "status") {
    const connection = await dependencies.getDiscordConnection(db, discordUserId);
    await editOriginalResponse(interaction, connection ? "Sua conta Discord está conectada ao Cloudy." : "Sua conta Discord não está conectada. Use /cloudy conectar em uma DM.");
    return;
  }

  if (subcommand.name === "desconectar") {
    await dependencies.disconnectDiscord(db, discordUserId);
    await editOriginalResponse(interaction, "Discord desconectado. Seu token e seus Atalhos continuam ativos.");
    return;
  }

  if (subcommand.name === "salvar") {
    const connection = await requireConnection(db, discordUserId, dependencies);
    const url = readOptionValue(subcommand.options, "link");
    const observation = readOptionalOptionValue(subcommand.options, "observacao");
    const result = await dependencies.createIntegrationItem(db, connection.userId, { url, text: observation });
    await dependencies.touchDiscordConnection(db, discordUserId);
    await editOriginalResponse(interaction, formatSaveResult(result));
    return;
  }

  await editOriginalResponse(interaction, "Escolha uma ação válida: conectar, salvar, status ou desconectar.");
}

async function saveMessageLinks(interaction: DiscordInteraction, discordUserId: string, db: Client, dependencies: DiscordDependencies): Promise<void> {
  const connection = await requireConnection(db, discordUserId, dependencies);
  const targetId = interaction.data?.target_id;
  const content = targetId ? interaction.data?.resolved?.messages?.[targetId]?.content ?? "" : "";
  const uniqueUrls = [...new Set(extractDiscordUrls(content))];
  if (!uniqueUrls.length) {
    await editOriginalResponse(interaction, "Não encontrei nenhum link HTTP ou HTTPS nessa mensagem.");
    return;
  }

  const urls = uniqueUrls.slice(0, MAX_MESSAGE_URLS);
  const results = await Promise.allSettled(urls.map((url) => dependencies.createIntegrationItem(db, connection.userId, { url, text: null })));
  await dependencies.touchDiscordConnection(db, discordUserId);
  const saved = results.filter((result): result is PromiseFulfilledResult<IntegrationItemResult> => result.status === "fulfilled" && !result.value.duplicate).length;
  const duplicate = results.filter((result): result is PromiseFulfilledResult<IntegrationItemResult> => result.status === "fulfilled" && result.value.duplicate).length;
  const failed = results.filter((result) => result.status === "rejected").length;
  const remaining = uniqueUrls.length - urls.length;
  const parts = [`${saved} ${saved === 1 ? "link salvo" : "links salvos"}`, `${duplicate} já ${duplicate === 1 ? "existia" : "existiam"}`];
  if (failed) parts.push(`${failed} com erro`);
  if (remaining) parts.push(`${remaining} não processado${remaining === 1 ? "" : "s"} — divida a mensagem para salvar o restante`);
  await editOriginalResponse(interaction, `${parts.join(" · ")}.`);
}

async function requireConnection(db: Client, discordUserId: string, dependencies: DiscordDependencies): Promise<DiscordConnection> {
  const connection = await dependencies.getDiscordConnection(db, discordUserId);
  if (!connection) throw new HttpError(401, "discord_not_connected");
  return connection;
}

function readSubcommand(options: DiscordOption[] | undefined): DiscordOption | null {
  const option = options?.[0];
  return option?.type === 1 ? option : null;
}

function readOptionValue(options: DiscordOption[] | undefined, name: string): string {
  const value = options?.find((option) => option.name === name)?.value;
  if (!value) throw new HttpError(400, `missing_${name}`);
  return value;
}

function readOptionalOptionValue(options: DiscordOption[] | undefined, name: string): string | null {
  const value = options?.find((option) => option.name === name)?.value;
  return value?.trim() || null;
}

export function extractDiscordUrls(content: string): string[] {
  const urls = (content.match(URL_PATTERN) ?? []).map((candidate) => candidate.replace(/[.,!?;:'"\]}]+$/g, "")).filter((candidate) => {
    try {
      const url = new URL(candidate);
      return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
    } catch {
      return false;
    }
  });
  return [...new Set(urls)];
}

function formatSaveResult(result: IntegrationItemResult): string {
  return result.duplicate ? "Esse link já estava salvo no Cloudy." : "Link salvo no Cloudy, na coleção Integrações.";
}

function formatDiscordError(error: unknown): string {
  if (!(error instanceof HttpError)) return "Não foi possível concluir o comando agora. Tente novamente em instantes.";
  if (error.message === "invalid_capture_token") return "Token inválido ou revogado. Gere um novo token no Cloudy e conecte novamente.";
  if (error.message === "missing_capture_token") return "Informe o token de integração para conectar o Discord.";
  if (error.message === "discord_not_connected") return "Sua conta Discord não está conectada. Use /cloudy conectar em uma DM.";
  if (error.message === "invalid_url" || error.message === "invalid_url_length") return "Esse link não é uma URL HTTP ou HTTPS válida.";
  if (error.message === "category_item_limit_reached") return "A coleção Integrações atingiu o limite de links.";
  return "Não foi possível concluir o comando agora. Tente novamente em instantes.";
}

async function editOriginalResponse(interaction: DiscordInteraction, content: string): Promise<void> {
  const response = await fetch(`${DISCORD_API_BASE}/webhooks/${encodeURIComponent(interaction.application_id)}/${encodeURIComponent(interaction.token)}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
  });
  if (!response.ok) throw new Error(`discord_response_${response.status}`);
}

async function verifyDiscordSignature(body: string, signature: string | null, timestamp: string | null, publicKey: string | undefined): Promise<boolean> {
  if (!signature || !timestamp || !publicKey || !/^\d+$/.test(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > MAX_SIGNATURE_AGE_SECONDS) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(signature), new TextEncoder().encode(`${timestamp}${body}`));
  } catch {
    return false;
  }
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) throw new Error("invalid_hex");
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function discordJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
