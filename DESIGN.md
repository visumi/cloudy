<!-- SEED: atualizar com os tokens reais quando a linguagem visual do produto evoluir. -->
---
name: Cloudy
description: Espaço pessoal, mobile-first, para organizar links em uma futura nuvem visual.
---

# Design System: Cloudy

## Creative North Star

“A nuvem de referências”: uma ferramenta pessoal, clara e amigável, onde cada link pode virar uma pequena parte de um mapa de ideias.

## Key Characteristics

- Mobile-first e orientado à próxima ação.
- Superfícies claras, estrutura tonal e pouca sombra.
- Azul funcional para ação, foco e seleção.
- Tipografia SF/system com escala compacta.
- Transições curtas, sempre respeitando `prefers-reduced-motion`.

## Colors

- Primary: azul sky-600 `oklch(0.588 0.158 241.966)`.
- Background: branco de trabalho `oklch(1 0 0)`.
- Surface: superfície fria `oklch(0.96 0.012 235)`.
- Text: tinta azulada `oklch(0.21 0.028 250)`.
- Muted: texto secundário `oklch(0.46 0.035 250)`.

## Components

- Botões com altura mínima de 44px no mobile e foco visível.
- Painéis com raio máximo de 12px, borda discreta e sombra apenas quando necessária.
- Inputs brancos com borda visível, raio de 8px e mensagens textuais de erro.
- Empty states sempre explicam o que poderá acontecer e qual ação vem em seguida.

## Do / Don't

- Fazer: usar tokens semânticos, leitura rápida e componentes equivalentes entre breakpoints.
- Evitar: CRM, planilha, dashboard pesado, gradiente em texto, glassmorphism e animação decorativa.
