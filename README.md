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

O Worker usa os segredos `TURSO_URL`, `TURSO_AUTH_TOKEN`, `FIREBASE_PROJECT_ID` e `OWNER_EMAIL`. Configure-os com `wrangler secret bulk` ou no painel do Worker. O arquivo `.dev.vars` é apenas local e não deve ser versionado.

## Firebase

Crie um projeto separado para o Cloudy, habilite Google em Authentication, cadastre um app Web e autorize `localhost` e `cloudy.isumi.com.br`.

## Publicação

- Frontend: GitHub Pages em `cloudy.isumi.com.br`.
- API: Cloudflare Worker em `cloudy-api.isumi.com.br`.
- O workflow de frontend usa apenas variáveis públicas do Firebase.
- O workflow da API usa secrets do GitHub para sincronizar os segredos do Worker.
