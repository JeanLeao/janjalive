---
name: Janjalive
description: Salas efêmeras para compartilhar tela e áudio no navegador.
colors:
  primary: "#2563eb"
  primary-hover: "#1d4ed8"
  accent-text: "#79b4ff"
  focus: "#3b82f6"
  page: "#080a0f"
  deep-panel: "#0d1117"
  landing-form: "#10151d"
  panel: "#161b22"
  elevated: "#21262d"
  border: "#30363d"
  input-border: "#484f58"
  text: "#e6edf3"
  heading: "#f0f3f6"
  supporting-text: "#d0d7de"
  muted-text: "#afb8c1"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: "clamp(38px, 4.1vw, 52px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  section-title:
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  feature-title:
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontSize: "14px"
    lineHeight: 1.7
  supporting:
    fontSize: "12px"
    lineHeight: 1.5
rounded:
  control: "8px"
  panel: "12px"
  landing-form: "16px"
spacing:
  compact: "8px"
  control: "16px"
  panel: "24px"
  section: "32px"
  wide: "48px"
  hero: "64px"
components:
  lobby-primary-button:
    backgroundColor: "{colors.primary}"
    textColor: "#fff"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  lobby-primary-button-hover:
    backgroundColor: "{colors.primary-hover}"
  lobby-input:
    backgroundColor: "{colors.page}"
    textColor: "#fff"
    rounded: "{rounded.control}"
    height: "48px"
  landing-form:
    backgroundColor: "{colors.landing-form}"
    rounded: "{rounded.landing-form}"
    padding: "28px"
---

# Design System: Janjalive

## Overview

**Creative North Star: "A tela em primeiro plano"**

O Janjalive mantém uma interface escura, azul e funcional. A mídia ocupa o palco; painéis discretos organizam controles e informações. A landing estende essa identidade com a mesma tipografia do sistema e componentes Mantine, sem estabelecer uma identidade independente.

Este registro descreve a implementação existente. Os valores de títulos e composição da landing são locais a essa superfície; não substituem a hierarquia dos controles de sala.

**Key Characteristics:**

- Fundo profundo, superfícies em camadas tonais e bordas discretas.
- Azul para ações e destaques legíveis.
- Controles com rótulos diretos, foco visível e espaço para toque.
- Interface real como evidência visual do produto.

## Colors

### Primary

Azul de ação identifica criar sala e compartilhar tela; o azul claro destaca texto e ícones no fundo escuro. A variante de hover escurece a ação principal da landing. O tema mantém `primaryColor: 'blue'` do Mantine; os valores explícitos acima descrevem as substituições observadas, sem redefinir a escala inteira da biblioteca.

### Neutral

O fundo profundo sustenta a página e o palco vazio. Painéis profundos, painéis comuns e superfícies elevadas distinguem regiões sem competir com o vídeo. A borda estrutural separa painéis; campos da landing recebem uma borda mais clara. Texto de apoio e texto secundário conservam contraste no fundo escuro.

**The Action Blue Rule.** Use o azul de ação nos controles principais e o azul claro para texto sobre fundos escuros, seguindo os papéis já presentes.

## Typography

**Display Font:** a mesma pilha de sistema definida no tema, preservada por esta extensão.
**Body Font:** a pilha de sistema definida no tema.

A hierarquia vem de tamanho, peso e espaçamento. Não há fonte adicional carregada pela landing. O título principal usa peso forte e tracking compacto; conteúdo e instruções usam tamanhos menores e entrelinha aberta.

### Hierarchy

- **Headline:** título principal da landing; reduz para (38px) até o breakpoint intermediário e para (32px) nas telas mais estreitas.
- **Section title:** abertura das seções da landing; reduz para (28px) no mobile.
- **Feature title:** recursos principais; reduz para (28px) nos breakpoints intermediário e mobile. Recursos menores usam (21px), com (20px) no intermediário.
- **Body:** texto dos recursos menores. O hero usa (17px) com entrelinha (1.7), reduzindo para (15px). Parágrafos dos recursos principais usam (15px), reduzindo para (14px).
- **Supporting:** legendas e informações auxiliares; não é tamanho para controles principais.

## Layout

A landing usa o Container `lg` existente do Mantine. O hero dispõe texto e formulário lado a lado, com coluna de formulário de até (420px). Os recursos principais combinam texto e imagem de interface; os menores usam duas colunas. Esses arranjos pertencem à landing, não são uma grade obrigatória para salas.

Até (62em), os intervalos diminuem e o hero passa a duas colunas iguais. Até (43em), hero, recursos principais, recursos menores e notas empilham em uma coluna. Até (23em), título e espaçamentos do formulário diminuem novamente. Os diagramas de comparação preservam suas duas telas lado a lado.

A área efetiva de interação da landing é de pelo menos (44px) para navegação, modal e checkbox; ações e campos principais têm pelo menos (48px). O palco tem sua própria escala de controles: (36px), ampliada para (44px) em telas de até (768px) ou ponteiros de baixa precisão. Não confundir o tamanho do ícone com a área clicável.

## Elevation & Depth

A profundidade vem principalmente de superfícies tonais e bordas. A prévia da sala na landing acrescenta uma sombra suave (`0 16px 40px #00000030`); isso é uma exceção localizada de apresentação, não uma sombra padrão para cada painel. Vídeos permanecem sobre fundos escuros, com controles sobrepostos quando necessário.

## Shapes

O tema Mantine define raio padrão `md`, equivalente a (8px) na escala padrão instalada. Painéis de apresentação usam cantos de (12px); o formulário desktop da landing usa (16px), reduzindo para (12px) no mobile. Miniaturas de sala usam (8px) e recorte do conteúdo. Avatares e indicadores de estado podem ser circulares; o sistema não exige que toda forma seja retangular.

## Components

### Buttons

Ações principais são preenchidas em azul, com texto branco. A landing usa altura mínima generosa e ícones SVG ao lado de rótulos. Ações secundárias usam a variante `default` do Mantine; informações na navegação usam `subtle` cinza. Os estados de carregamento e desabilitado permanecem sob responsabilidade dos componentes existentes.

O foco global é um contorno azul de (2px), afastado (2px), definido no root com prioridade `!important`. Não substituir foco por mudança de cor de texto apenas.

### Cards / Containers

O formulário possui fundo próprio, borda estrutural e espaçamento interno que diminui no mobile. A prévia da sala usa painel profundo, borda, recorte e legenda. A seção Comparar tem um tratamento azul tonal específico; não transforma todos os painéis em cartões azuis.

### Inputs / Fields

Campos principais da landing têm fundo profundo, texto branco, borda visível, placeholder secundário e tamanho de texto de (16px). Rótulos continuam visíveis; erro usa mensagem textual. O checkbox inclui descrição e área de interação expandida pelo rótulo. Modais preservam foco, rótulos e controles de fechamento acessíveis.

### Navigation

Marca à esquerda e ações Sobre/Ajuda à direita, com divisão inferior discreta. No mobile, diminuem marca e espaçamento sem remover as ações. O link de pular para criar sala torna-se visível ao receber foco. Rodapé empilha no mobile.

### Palco da sala

A landing demonstra a sala em uso com réplicas estáticas (`apps/web/src/features/landing/LandingDemos.tsx`): selo do apresentador, pílula de qualidade, trilho de visualização, dock, seletor Conteúdo do palco, painel de interações, reprodutor da Watch Party, cabeçalhos do Comparar, cartões de arquivo e prévia de clipe. Elas reaproveitam valores dos componentes reais da sala, não criam MediaStream, `<video>`, WebRTC ou signaling, ficam `inert`/`aria-hidden` e sempre trazem a nota “Demonstração ilustrativa · nenhuma sala conectada” ou legenda equivalente. Conteúdo transmitido é concreto e coerente entre seções (código de um componente e a página resultante), nunca slogans.

### Motion

Entrada coordenada do hero (título, descrição, convite e formulário, até ~0,9 s, sem bloquear interação). Seções abaixo da dobra entram uma vez ao aparecer; no servidor, sem JavaScript e com movimento reduzido, o estado final é o padrão. Momentos autorais: anotação desenhada sobre o código e a passagem de uma para duas transmissões no Comparar. Sem laços infinitos; `prefers-reduced-motion` remove deslocamentos e mantém trocas de estado.

## Do's and Don'ts

### Do:

- **Do** preservar a identidade escura, azul, Mantine e a tipografia existente ao estender superfícies.
- **Do** manter foco visível, rótulos e áreas efetivas de toque nas variações responsivas.
- **Do** representar o produto com réplicas fiéis dos estados reais, claramente identificadas como demonstração.

### Don't:

- **Don't** apresentar demonstrações como sessão real: sem indicadores de conexão, sempre identificadas como ilustrativas.
- **Don't** transformar valores específicos de apresentação da landing em regras universais para a interface da sala.
- **Don't** substituir componentes existentes por novas dependências para reproduzir esta identidade.
