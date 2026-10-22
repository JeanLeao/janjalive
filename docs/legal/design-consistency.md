# Consistência visual e documental das páginas legais

Revisão de extensão ordinária, em modo de leitura, de 22 de outubro de 2026. Este relatório não altera nem substitui o sistema existente.

Fontes confrontadas: `apps/web/DESIGN.md`, `apps/web/PRODUCT.md`, `apps/web/src/routes/__root.tsx`, `LegalPage.tsx`, `LegalPage.module.css`, `documents.ts`, as rotas `/termos` e `/privacidade` e o diff do rodapé de `index.tsx`/`index.module.css`. As métricas abaixo vêm de `docs/legal/browser-audit.json`; a revisão visual independente é registrada separadamente em `visual-review.md`.

## Resultado

A extensão preserva a identidade escura, azul e funcional documentada. Fundo `#080a0f`, texto `#e6edf3`, títulos `#f0f3f6`, links `#79b4ff`, borda `#30363d` e aviso `#10151d` já constam da paleta existente. O painel de aviso usa o raio existente de 12px e separação por tom e borda, sem introduzir sombras ou imagens. A tipografia de sistema é herdada do tema global; não há carregamento de fonte adicional.

A coluna de até 72ch e o corpo de 16px com entrelinha 1.8 são escolhas locais para documentos longos. A descrição usa 18px, o título varia de 32px a 44px, títulos de seção usam 23px (22px no mobile) e títulos de navegação usam 20px. Esses valores ampliam a hierarquia desta superfície, sem substituir a escala de controles da sala nem converter a composição da landing em regra geral. O próprio DESIGN.md caracteriza a hierarquia da landing como local, portanto as diferenças de tamanho requerem registro, não uma atualização automática do sistema.

Links de cabeçalho, sumário e rodapé têm altura mínima de 44px; o link inline da LGPD é uma referência dentro de parágrafo e não está incluído nessa declaração de alvos de navegação. A área clicável é o elemento inteiro, não apenas seus caracteres. O foco global de 2px permanece aplicável e há link para pular ao documento. O rodapé da landing acrescenta somente navegação legal com quebra de linha, preservando o estilo existente de links e seu mínimo de 44px.

## Evidência de navegador já produzida

O relatório de Chromium sobre build de produção em `localhost:4321` registra ambas as rotas em 1280, 768, 390 e 320px: HTTP 200, título renderizado no servidor, ausência de overflow horizontal, corpo de 16px/28.8px, foco sólido de 2px e contraste mínimo medido de aproximadamente 9.23:1. Os alvos de navegação amostrados têm pelo menos 44px. Esta revisão documental leu essas medições; não executou uma nova sessão de navegador nem certifica todos os estados possíveis de cor/interação.

## Alertas e deriva preservados

O relatório versionado `docs/legal/impeccable-findings.json` contém 51 avisos consultivos: oito na folha legal (sete tamanhos tipográficos e `#fff` na seleção), os demais na landing. O branco já aparece em componentes e na descrição de botões do DESIGN.md, embora não seja uma primitiva de `colors`; o detector não equivale a uma proibição. Os literais apontados na landing não são alterados pelo diff de rodapé. Nenhum aviso foi resolvido pela canonização de novos tokens ou por mudanças alheias ao pedido.

PRODUCT.md ainda contém o escopo de um handoff F14 anterior e não constitui um inventário completo dos recursos descritos nas minutas. Seu compromisso durável com a linguagem visual e a acessibilidade continua compatível com a extensão; a frase “Esta tarefa modifica somente a UI da F14” é contexto histórico e não foi reescrita. O contexto do trabalho também sinalizou um sidecar desatualizado; ele foi preservado e não foi usado como autoridade para ampliar tokens. DESIGN.md, PRODUCT.md e os diretórios preexistentes `.agent`, `.impeccable` e `apps/web/.impeccable` permanecem fora do escopo de escrita desta revisão.

As páginas exibem versão de minuta e pendências operacionais/jurídicas, e ambas as rotas incluem `noindex`. O relatório de consistência visual não valida bases legais, fornecedores ou prontidão para publicação definitiva. Não há mudança de design system, dependência nova ou asset raster na extensão revisada.
