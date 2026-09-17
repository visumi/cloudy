const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;

if (!applicationId || !botToken) {
  throw new Error("DISCORD_APPLICATION_ID e DISCORD_BOT_TOKEN precisam estar configurados nesta sessão.");
}

const commands = [
  {
    name: "cloudy",
    type: 1,
    description: "Salve links na sua coleção Cloudy",
    integration_types: [1],
    contexts: [0, 1, 2],
    options: [
      {
        name: "conectar",
        type: 1,
        description: "Conecta esta conta Discord ao Cloudy",
        options: [{ name: "token", type: 3, description: "Token de integração do Cloudy", required: true, min_length: 1, max_length: 256 }]
      },
      {
        name: "salvar",
        type: 1,
        description: "Salva um link na coleção Integrações",
        options: [
          { name: "link", type: 3, description: "URL HTTP ou HTTPS para salvar", required: true, min_length: 1, max_length: 2048 },
          { name: "observacao", type: 3, description: "Observação opcional", required: false, max_length: 120 }
        ]
      },
      { name: "status", type: 1, description: "Mostra o estado da conexão com o Cloudy" },
      { name: "desconectar", type: 1, description: "Remove a conexão desta conta Discord" }
    ]
  },
  {
    name: "Salvar no Cloudy",
    type: 3,
    integration_types: [1],
    contexts: [0, 1, 2]
  }
];

for (const command of commands) {
  const response = await fetch(`https://discord.com/api/v10/applications/${encodeURIComponent(applicationId)}/commands`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(command)
  });
  if (!response.ok) {
    const responseBody = await response.text();
    let detail = responseBody.trim();
    try {
      const parsed = JSON.parse(responseBody);
      detail = parsed.message || detail;
      if (parsed.code) detail += ` (código ${parsed.code})`;
    } catch {
      // Keep the raw response when Discord does not return JSON.
    }
    throw new Error(`Falha ao registrar ${command.name}: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`);
  }
  console.log(`Comando registrado: ${command.name}`);
}
