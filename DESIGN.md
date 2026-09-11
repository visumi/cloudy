---
name: Cloudy
description: Espaço visual, mobile-first, para guardar referências e ideias.
colors:
  app-bg: "#164561"
  sky-50: "#f0f9ff"
  sky-200: "#bae6fd"
  sky-700: "#0369a1"
  sky-900: "#0c4a6e"
  green-50: "#f0fdf4"
  green-200: "#bbf7d0"
  green-700: "#15803d"
  red-50: "#fef2f2"
  red-700: "#b91c1c"
  sky-100: "#e0f2fe"
  white: "oklch(1 0 0)"
  ink-button: "#10202c"
  focus-soft: "oklch(0.75 0.12 242)"
  focus-blue: "oklch(0.78 0.13 235)"
  border-soft: "oklch(0.82 0.055 235)"
  border-add: "oklch(0.86 0.04 235)"
  muted-light: "oklch(0.74 0.025 235)"
  link-light: "oklch(0.84 0.12 235)"
  link-line: "oklch(0.62 0.1 235)"
  link-hover: "oklch(0.94 0.08 235)"
  error-light: "oklch(0.82 0.16 25)"
  ink: "oklch(0.21 0.028 250)"
  surface: "oklch(0.96 0.012 235)"
typography:
  display:
    fontFamily: "DynaPuff, system-ui, sans-serif"
    fontSize: "clamp(4rem, 18vw, 7.2rem)"
    fontWeight: 500
    lineHeight: 0.9
    letterSpacing: "-0.055em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.08em"
  eyebrow:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, sans-serif"
    fontSize: "0.75rem"
  brand:
    fontFamily: "DynaPuff, system-ui, sans-serif"
    fontSize: "1.1rem"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, sans-serif"
    fontSize: "clamp(2rem, 9vw, 3.2rem)"
  section-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, sans-serif"
    fontSize: "1.2rem"
  tagline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, sans-serif"
    fontSize: "clamp(1.25rem, 4.8vw, 2rem)"
  error:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, sans-serif"
    fontSize: "0.9rem"
  menu-item:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, sans-serif"
    fontSize: "0.84rem"
  account-email:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, sans-serif"
    fontSize: "0.78rem"
  version:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, sans-serif"
    fontSize: "0.68rem"
rounded:
  sm: "11px"
  md: "18px"
  button: "10px"
  account: "9px"
  circle: "50%"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
  xl: "24px"
components:
  icon-button:
    backgroundColor: "oklch(0.97 0.012 235)"
    textColor: "{colors.ink}"
    rounded: "{rounded.circle}"
    size: "58px"
  icon-button-add:
    backgroundColor: "{colors.sky-50}"
    textColor: "{colors.sky-900}"
    rounded: "{rounded.circle}"
    size: "72px"
  dropdown-menu:
    backgroundColor: "{colors.sky-50}"
    textColor: "{colors.sky-900}"
    rounded: "{rounded.md}"
    padding: "10px"
  dropdown-menu-item:
    backgroundColor: "transparent"
    textColor: "{colors.sky-900}"
    rounded: "{rounded.sm}"
    height: "40px"
---

# Design System: Cloudy

## Overview

**Creative North Star: “A nuvem de referências”**

Cloudy é um espaço pessoal que transforma referências soltas em uma experiência leve e visual. A interface deve desaparecer o suficiente para que a nuvem 3D e a próxima ação permaneçam no centro da atenção.

O sistema combina um workspace profundo em azul Sky com superfícies claras e orgânicas. A densidade é baixa, os controles são compactos e cada interação deve parecer uma pequena peça física pousando no espaço.

**Key Characteristics:**

- Workspace escuro com luz radial mais clara perto da nuvem 3D.
- Controles circulares agrupados como uma pequena nuvem branca.
- Menus contextuais claros, arredondados e ancorados no centro do grupo.
- Paleta Sky para ações, Green para confirmação e Red para saída.
- Movimento curto, funcional e sempre compatível com redução de movimento.

## Colors

A paleta parte de um azul Sky profundo e usa superfícies quase brancas para criar contraste e sensação de leveza.

### Primary

- **Sky profundo** (`#0c4a6e`): ícone `Plus` em repouso, texto de menus e conteúdo principal.
- **Sky de ação** (`#0369a1`): ícones laterais, foco e elementos interativos secundários.

### Secondary

- **Verde de confirmação** (`#15803d`): hover do botão `Plus` e estados positivos.

### Tertiary

- **Vermelho de saída** (`#b91c1c`): ação de sair e seu foco.

### Neutral

- **Sky surface** (`#f0f9ff`): fundo dos dropdowns.
- **Sky line** (`#bae6fd`): bordas dos dropdowns e avatares.
- **Ink** (`oklch(0.21 0.028 250)`): texto escuro da interface.
- **Workspace** (`#164561`): base do app autenticado.

## Typography

**Display Font:** DynaPuff (with system-ui fallback)

**Body Font:** -apple-system, BlinkMacSystemFont, “SF Pro Text”, “Helvetica Neue”, sans-serif

**Character:** DynaPuff dá personalidade ao nome Cloudy; o corpo do sistema permanece neutro e legível para que os controles não pareçam brinquedos decorativos.

### Hierarchy

- **Display** (500, `clamp(4rem, 18vw, 7.2rem)`, `0.9`): marca Cloudy na tela de login.
- **Body** (400, `1rem`, `1.5`): textos de apoio e conteúdo funcional.
- **Label** (650–750, `0.84rem`, `1.2`): itens acionáveis dentro de menus.

## Layout

O app autenticado ocupa toda a viewport (`100dvh`) e centraliza a nuvem 3D no workspace. A nuvem de ações fica ancorada no bottom, com 20px de respiro ou o safe area disponível no mobile.

O grupo de ações é horizontal e compacto: botões laterais de 58px, `Plus` central de 72px e sobreposição de 10px. O dropdown aparece acima do grupo, sempre alinhado ao eixo central do `Plus`, com largura máxima de 214px e redução para caber na viewport.

## Elevation & Depth

A profundidade combina o gradiente radial do workspace com sombras ambientes suaves. Controles recebem uma sombra difusa em repouso e uma elevação ligeiramente maior no hover. Dropdowns usam uma sombra mais ampla para separar a superfície Sky-50 do fundo escuro sem parecerem cartões pesados.

### Shadow Vocabulary

- **Action ambient:** `0 12px 24px oklch(0.08 0.04 245 / .22)`, para os botões da nuvem.
- **Action hover:** `0 15px 26px oklch(0.08 0.04 245 / .27)`, apenas como resposta de interação.
- **Dropdown lift:** `0 18px 36px oklch(0.08 0.04 245 / .25)`, para menus abertos.

## Shapes

Botões de ação são círculos verdadeiros e se sobrepõem para formar uma nuvem. Menus usam raio de 18px; itens internos usam 11px. A imagem da conta, quando presente, é quadrada com raio de 9px. Bordas são finas e claras, nunca usadas como decoração pesada.

## Components

### IconButton

Componente reutilizável para ações circulares de alto destaque. Recebe `tone` (`settings`, `add` ou `share`), `label`, conteúdo de ícone e atributos nativos de botão.

- **Shape:** círculo de 58px; o tom `add` cresce para 72px.
- **Default:** superfície quase branca, borda Sky translúcida e sombra ambiente.
- **Hover:** elevação curta; `Plus` troca para Green; `Settings` gira; `Share2` faz um shake discreto.
- **Focus:** outline Sky de 3px com offset de 3px.
- **Accessibility:** sempre exige label para tecnologia assistiva, mesmo sem texto na tela.

### DropdownMenu

Primitive reutilizável para painéis contextuais posicionados acima de um trigger.

- **Surface:** fundo `sky-50`, borda `sky-200`, raio de 18px e sombra de dropdown; a identificação semântica é feita por `aria-label`, sem título visual.
- **Motion:** entrada com fade, blur limitado e deslocamento vertical de 8px; saída mais rápida.
- **Behavior:** um menu por vez, clique externo e `Escape` fecham o painel; o primeiro item recebe foco.
- **Responsive:** largura limitada a `calc(100vw - 24px)` para preservar margens em telas estreitas.

### DropdownMenuItem

Item reutilizável com ícone Lucide e label. Pode receber `destructive` para ações irreversíveis ou de saída.

- **Shape:** altura mínima de 40px e raio de 11px.
- **Default / Hover:** transparente em repouso; `sky-100` no hover.
- **Destructive:** texto, ícone e foco em Red-700; hover em Red-50, sem borda vermelha.

### ActionCloud

Composição assinatura que agrupa Settings, Plus e Share2. O dock some após 4,2 segundos de inatividade e retorna com atividade do mouse, toque, rolagem, clique ou teclado. O temporizador pausa enquanto um dropdown está aberto.

### LoginButton

Botão pill branco para autenticação Google, com foco visível e linguagem visual separada do workspace autenticado.

## Do's and Don'ts

### Do:

- **Do** reutilizar `IconButton`, `DropdownMenu` e `DropdownMenuItem` antes de criar variantes locais.
- **Do** usar os tokens Sky, Green e Red definidos neste documento.
- **Do** manter áreas acionáveis com pelo menos 44px em telas móveis.
- **Do** usar ícones Lucide com peso consistente e labels acessíveis.
- **Do** respeitar `prefers-reduced-motion` em toda animação.

### Don't:

- **Don't** criar novos menus com posicionamento ou sombra próprios sem atualizar os primitives.
- **Don't** usar texto branco ou cinza sem verificar contraste com o fundo.
- **Don't** transformar ações compactas em cards ou barras pesadas.
- **Don't** usar animação contínua para chamar atenção para controles estáticos.
- **Don't** substituir o caráter Sky por gradientes de texto, glassmorphism ou padrões decorativos.
