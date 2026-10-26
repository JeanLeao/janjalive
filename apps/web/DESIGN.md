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
    fontSize: "clamp(38px, 4.4vw, 56px)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.038em"
  section-title:
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.03em"
rounded:
  control: "8px"
  panel: "12px"
  landing-form: "16px"
---

# Design System: Janjalive

## Overview

A tela ocupa o primeiro plano. Preserve a identidade escura, azul e funcional, com Mantine e tipografia do sistema. Contexto do produto em [PRODUCT.md](PRODUCT.md).

As fontes de manutenção são [theme.ts](src/theme.ts), [estilos da landing](src/routes/index.module.css) e os componentes da sala. Tokens de composição da landing são locais àquela superfície, não uma escala obrigatória para todo o aplicativo.

## Colors

Azul preenchido para ações principais; azul claro para texto e ícones em fundos escuros. Superfícies profundas, painéis e bordas discretas organizam a interface sem competir com a mídia. O tema mantém a escala `blue` do Mantine; os valores acima descrevem substituições locais existentes.

## Typography

Não carregar fontes adicionais. Na landing, o título principal usa o tamanho fluido acima, passa a 38px até 62em e a 32px até 23em. O título de seção passa de 34px a 28px até 43em. A descrição do hero usa 18px/1.65 e reduz a 15px. Outras superfícies mantêm suas hierarquias próprias, inclusive os documentos jurídicos.

## Layout

Hero com texto e formulário de até 420px; até 62em, duas colunas iguais; até 43em, uma coluna. O formulário usa padding de 28px, reduzindo nos breakpoints, e raio de 16px/12px. Não aplicar esses valores automaticamente à sala.

Na landing, navegação e controles de modal têm área efetiva mínima de 44px; ações e campos principais, 48px. A barra contextual do palco usa botões de 44px e trilho de 48px, ampliado a 56px até 768px ou com ponteiro de baixa precisão. O dock tem escala própria. Diferencie ícone, tamanho visual e área efetiva de interação.

## Components

Reutilize componentes e variantes Mantine existentes. Preserve estados de erro/carregamento, rótulos, foco, teclado, retorno de foco e áreas de toque. O foco global no root usa contorno azul de 2px com afastamento de 2px; estilos locais devem respeitar essa regra.

As demonstrações da landing em [LandingDemos.tsx](src/features/landing/LandingDemos.tsx) reproduzem estados ilustrativos: não criam vídeo, MediaStream, WebRTC ou signaling, permanecem `inert`/`aria-hidden` e identificadas como demonstração. Não apresentá-las como salas conectadas.

## Motion

Respeite `prefers-reduced-motion`. A entrada do hero e revelações por scroll não devem bloquear o formulário; conteúdo permanece disponível sem JavaScript. Preserve as sombras e efeitos locais existentes sem transformá-los em regra universal para painéis.
