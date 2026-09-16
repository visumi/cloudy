# Cloudy

Base da aplicação para organizar links em uma futura nuvem visual.

## Stack

- React + Vite + TypeScript
- Firebase Authentication com Google
- Cloudflare Workers
- Turso/libSQL

## Desenvolvimento

1. Copie `.env.example` para `.env` e preencha as credenciais públicas do Firebase e as credenciais locais do Turso.
2. Execute `npm install`.
3. Rode `npm run db:migrate` com o banco configurado.
4. Em um terminal, rode `npm run api:dev`.
5. Em outro, rode `npm run dev`.

O frontend fica em `http://localhost:5173` e a API em `http://localhost:8787`.

## Cloudflare Worker

O Worker usa os segredos `TURSO_URL`, `TURSO_AUTH_TOKEN`, `FIREBASE_PROJECT_ID`, `OWNER_EMAIL` e `DISCORD_PUBLIC_KEY`. Configure-os com `wrangler secret bulk` ou no painel do Worker. O arquivo `.dev.vars` é apenas local e não deve ser versionado.

## Bot do Discord

O bot usa Interactions HTTP no mesmo Worker e não precisa de Gateway ou intents privilegiadas.

1. Crie um app em [Discord Developer Portal](https://discord.com/developers/applications), copie o **Application ID** e a **Public Key** em **General Information**.
2. Na aba **Bot**, adicione o bot e gere um token. Guarde-o somente para registrar comandos; nunca o coloque no código ou no frontend.
3. Em **Installation**, habilite **User Install**, selecione apenas `applications.commands` e use **Discord Provided Link**.
4. Depois de publicar a API, configure `https://cloudy-api.isumi.com.br/integrations/discord/interactions` como **Interactions Endpoint URL**.
5. Registre os comandos com uma sessão temporária do PowerShell:

   ```powershell
   $env:DISCORD_APPLICATION_ID="seu_application_id"
   $env:DISCORD_BOT_TOKEN="seu_bot_token"
   npm run discord:register
   Remove-Item Env:DISCORD_APPLICATION_ID
   Remove-Item Env:DISCORD_BOT_TOKEN
   ```

6. Cadastre o **Discord Provided Link** como `VITE_DISCORD_INSTALL_URL` no `.env` local e nas variáveis do frontend publicado.
7. Instale o app na sua conta Discord, abra uma DM com o Cloudy e use `/cloudy conectar` com o token gerado em **Configurações → Integrações**.

No `.dev.vars` local, adicione `DISCORD_PUBLIC_KEY`. Em produção, cadastre-o como secret do Worker:

```powershell
npx wrangler secret put DISCORD_PUBLIC_KEY
```

## Firebase

Crie um projeto separado para o Cloudy, habilite Google em Authentication, cadastre um app Web e autorize `localhost` e `cloudy.isumi.com.br`.

## Gestão de acessos

Os e-mails definidos em `OWNER_EMAIL` são proprietários e podem abrir **Configurações → Acessos** para liberar ou desativar membros. Separe múltiplos proprietários por vírgula. Usuários autorizados entram com a conta Google cadastrada e mantêm categorias e itens isolados em sua própria nuvem.

## Publicação

- Frontend: GitHub Pages em `cloudy.isumi.com.br`.
- API: Cloudflare Worker em `cloudy-api.isumi.com.br`.
- O workflow de frontend usa apenas variáveis públicas do Firebase.
- O workflow da API usa secrets do GitHub para sincronizar os segredos do Worker.
