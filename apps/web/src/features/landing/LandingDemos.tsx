import React, { useEffect, useRef, useState } from 'react';
import { Title, Text } from '@mantine/core';
import styles from './LandingDemos.module.css';
import { useReveal } from './use-reveal';
import { getAvatarColor, getInitials } from '../room/utils/avatar';
import {
  IconScreen,
  IconChat,
  IconCinema,
  IconCompare,
  IconVolume,
  IconSignal,
  IconPictureInPicture,
  IconCamera,
  IconMinus,
  IconPlus,
  IconMaximize,
  IconLink,
  IconUsers,
  IconGear,
  IconExit,
  IconPause,
  IconSend,
  IconHand,
  IconChevronDown,
  IconPlay,
} from '../room/components/Icons';

/*
 * Ilustrações da landing. Reproduzem a aparência dos estados reais da sala com marcação
 * estática: não criam MediaStream, <video>, WebRTC ou signaling, e ficam fora da árvore
 * de acessibilidade (o texto ao redor descreve cada estado).
 */

const PRESENTER = 'Firminha';

function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const color = getAvatarColor(name);
  return <span className={styles.avatar} style={{ width: size, height: size, background: color.bg, color: color.text }}>{getInitials(name)}</span>;
}

function StreamerBadge({ name }: { name: string }) {
  return <span className={styles.streamerBadge}><Avatar name={name} /><b>{name} · Transmitindo</b><i className={styles.liveDot} /></span>;
}

type CodeToken = [kind: '' | 'k' | 'f' | 's' | 't' | 'p' | 'c', text: string];
const CODE: CodeToken[][] = [
  [['k', 'import'], ['', ' { useState } '], ['k', 'from'], ['s', " 'react'"], ['', ';']],
  [['k', 'import'], ['', ' styles '], ['k', 'from'], ['s', " './CharacterCard.module.css'"], ['', ';']],
  [],
  [['k', 'export function'], ['f', ' CharacterCard'], ['', '({ hero }: '], ['t', 'Props'], ['', ') {']],
  [['k', '  const'], ['', ' [level, setLevel] = '], ['f', 'useState'], ['', '('], ['p', '5'], ['', ');']],
  [['k', '  const'], ['', ' bonus = Math.'], ['f', 'ceil'], ['', '(level / '], ['p', '4'], ['', ') + '], ['p', '1'], ['', ';']],
  [],
  [['k', '  return'], ['', ' (']],
  [['t', '    <article'], ['p', ' className'], ['', '={styles.card}'], ['t', '>']],
  [['t', '      <h2>'], ['', '{hero.name}'], ['t', '</h2>']],
  [['t', '      <Stepper'], ['p', ' value'], ['', '={level}'], ['p', ' onChange'], ['', '={setLevel} '], ['t', '/>']],
  [['t', '      <Attributes'], ['p', ' items'], ['', '={hero.stats}'], ['p', ' bonus'], ['', '={bonus} '], ['t', '/>']],
  [['t', '    </article>']],
  [['', '  );']],
  [['', '}']],
];
const ANNOTATED_LINE = 5;

/** Janela de editor capturada por quem apresenta. */
function CodeScreen({ annotate = false }: { annotate?: boolean }) {
  return <div className={styles.screen}>
    <div className={styles.editor}>
      <div className={styles.editorTabs}><span data-active>CharacterCard.tsx</span><span>CharacterCard.module.css</span></div>
      <ol className={styles.code}>
        {CODE.map((line, index) => <li key={index} className={index === ANNOTATED_LINE ? styles.annotatedLine : undefined}>
          {line.map(([kind, text], tokenIndex) => <span key={tokenIndex} data-k={kind || undefined}>{text}</span>)}
          {index === ANNOTATED_LINE && annotate && <svg className={styles.annotation} viewBox="0 0 300 40" preserveAspectRatio="none">
            <path pathLength={1} d="M14 22 C 16 6, 120 2, 220 5 S 298 14, 290 26 S 200 39, 110 37 S 4 34, 10 18 S 40 6, 70 6" />
          </svg>}
        </li>)}
      </ol>
    </div>
  </div>;
}

/** Aba do navegador de outra pessoa com o resultado do mesmo componente. */
function CharacterScreen() {
  return <div className={`${styles.screen} ${styles.browser}`}>
    <div className={styles.address}><span>localhost:5173/fichas/lyra-vento-sul</span></div>
    <div className={styles.page}>
      <div className={styles.portrait}>
        <svg viewBox="0 0 100 105" preserveAspectRatio="xMidYMid meet">
          <path d="M50 8 88 30v45L50 97 12 75V30Z" fill="#9f2d2d" stroke="#f1c7a2" strokeWidth="2" strokeLinejoin="round" />
          <path d="M50 30 72 66H28Z" fill="#c2413a" stroke="#f1c7a2" strokeWidth="2" strokeLinejoin="round" />
          <path d="M50 30V8M50 30 12 30M50 30 88 30M72 66 88 30M72 66 88 75M72 66 50 97M28 66 12 30M28 66 12 75M28 66 50 97" stroke="#f1c7a2" strokeWidth="1.6" strokeLinecap="round" opacity=".85" />
          <text x="50" y="59" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff4e6">20</text>
        </svg>
      </div>
      <div className={styles.sheet}>
        <b>Lyra Vento-Sul</b>
        <span className={styles.sheetMeta}>Patrulheira · nível 5</span>
        <span className={styles.stepper}><i>−</i>5<i>+</i></span>
        <ul>
          <li><b>Destreza 18</b> +4</li>
          <li><b>Sabedoria 14</b> +2</li>
          <li><b>Força 12</b> +1</li>
          <li><b>Proficiência</b> +3</li>
        </ul>
      </div>
    </div>
  </div>;
}

function RailButton({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return <span className={styles.railButton} data-active={active || undefined}>{children}</span>;
}

function ViewRail() {
  return <span className={styles.rail}>
    <RailButton><IconChevronDown size={14} /></RailButton>
    <span className={styles.railGroup}>
      <RailButton active><IconVolume size={15} /></RailButton>
      <RailButton><IconCinema size={15} /></RailButton>
      <RailButton><IconPictureInPicture size={15} /></RailButton>
      <span className={styles.railOptional}><RailButton><IconCamera size={15} /></RailButton></span>
      <span className={`${styles.railZoom} ${styles.railOptional}`}>
        <RailButton><IconMinus size={14} /></RailButton><small>100%</small><RailButton><IconPlus size={14} /></RailButton>
      </span>
      <RailButton><IconMaximize size={15} /></RailButton>
    </span>
  </span>;
}

function Dock() {
  return <span className={styles.dock}>
    <span className={styles.dockPrimary}><IconScreen size={15} /><span>Compartilhar</span></span>
    <span className={styles.dockButton}><IconLink size={15} /></span>
    <span className={`${styles.dockButton} ${styles.dockPeople}`}><IconUsers size={15} /><small>5</small><span className={styles.handCount}><IconHand size={12} />1</span></span>
    <span className={`${styles.dockButton} ${styles.dockOptional}`}><IconGear size={15} /></span>
    <span className={`${styles.dockButton} ${styles.dockExit}`}><IconExit size={15} /></span>
  </span>;
}

function StageNav({ watch }: { watch: boolean }) {
  return <span className={styles.stageNav}>
    <span className={styles.stageTab} data-selected={!watch || undefined}><IconScreen size={14} /><span>Transmissões</span><small>1</small></span>
    <span className={styles.stageTab} data-selected={watch || undefined}><IconCinema size={14} /><span className={styles.fullLabel}>Vídeo compartilhado</span><span className={styles.shortLabel}>Vídeo</span><i className={styles.livePip} /></span>
  </span>;
}

function ChatPanel() {
  return <span className={styles.chat}>
    <span className={styles.chatTabs}><span data-active>Chat <i>2</i></span><span>Perguntas</span></span>
    <span className={styles.chatLog}>
      <span className={styles.message}><Avatar name="Hanzinza" size={20} /><span><b>Hanzinza</b><span>Dá para ampliar o <code>bonus</code>?</span></span></span>
      <span className={styles.message}><Avatar name="Frisquila" size={20} /><span><b>Frisquila</b>Usei o zoom aqui. Nível 5 dá +3, confere.</span></span>
      <span className={styles.poll}>
        <span className={styles.pollStatus}>Aberta</span>
        <b>Mantemos o retrato na ficha?</b>
        <span className={styles.pollOption} data-selected><span>Sim<small>Seu voto</small></span><em>3 · 75%</em><i style={{ '--w': '75%' } as React.CSSProperties} /></span>
        <span className={styles.pollOption}><span>Não</span><em>1 · 25%</em><i style={{ '--w': '25%' } as React.CSSProperties} /></span>
        <small className={styles.pollHint}>4 votos · Resultados ao vivo</small>
      </span>
    </span>
    <span className={styles.composer}><span>Mensagem</span><i><IconSend size={14} /></i></span>
  </span>;
}

function WatchScene() {
  return <span className={styles.watch}>
    <span className={styles.watchMeta}><b>abertura-da-campanha.webm</b><span className={styles.crew}><IconUsers size={14} />5/5 prontos</span></span>
    <span className={styles.videoFrame}>
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="landing-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0c1830" /><stop offset=".55" stopColor="#2b4a78" /><stop offset=".82" stopColor="#d58a5c" />
          </linearGradient>
          <linearGradient id="landing-lake" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9a6a5a" /><stop offset=".35" stopColor="#2b3d5c" /><stop offset="1" stopColor="#0b1422" />
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill="url(#landing-sky)" />
        <circle cx="214" cy="84" r="16" fill="#f6c58f" />
        <circle cx="214" cy="84" r="30" fill="#f6c58f" opacity=".12" />
        <path d="M0 116 L48 86 L86 104 L132 70 L176 102 L204 92 L230 100 L262 108 L320 88 V180 H0Z" fill="#1d2f4b" />
        <path d="M0 132 L40 112 L92 126 L150 100 L204 128 L250 112 L320 130 V180 H0Z" fill="#13213a" />
        <rect y="138" width="320" height="42" fill="url(#landing-lake)" />
        <path d="M170 146h88M184 154h60M196 161h36" stroke="#f6c58f" strokeOpacity=".5" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
    <span className={styles.transport}>
      <span className={styles.timeline}><small>12:48</small><span className={styles.track}><i /></span><small>41:20</small></span>
      <span className={styles.transportRow}>
        <span className={styles.playButton}><IconPause size={15} /><span>Pausar<span className={styles.wide}> para todos</span></span></span>
        <span className={styles.watchStatus}>Reproduzindo · sincronização aproximada</span>
        <span className={styles.localAudio}><IconVolume size={16} /><span className={styles.volume}><i /></span><small>Só você</small></span>
      </span>
    </span>
  </span>;
}

const SCENES = [
  {
    id: 'screen',
    icon: <IconScreen size={18} />,
    title: 'Tela e áudio',
    summary: 'Aba, janela ou tela inteira.',
    text: 'Escolha uma aba, janela ou tela inteira no navegador e inclua o áudio da aba ou do sistema, quando disponível. Zoom e anotações ajudam a acompanhar os detalhes, e a captura pode ser encerrada a qualquer momento.',
    figure: 'Palco com a transmissão de Firminha: o código da ficha de personagem de um jogo de RPG, com um trecho destacado por anotação, controles de visualização à direita e barra de controles da sala abaixo.',
  },
  {
    id: 'interactions',
    icon: <IconChat size={18} />,
    title: 'Interações',
    summary: 'Chat, reações, perguntas e enquetes.',
    text: 'Converse enquanto acompanha a transmissão: chat, reações e mão levantada, com perguntas e enquetes para organizar a conversa.',
    figure: 'Painel de interações aberto ao lado da transmissão, com duas mensagens no chat, uma reação e uma enquete com resultados ao vivo.',
  },
  {
    id: 'watch',
    icon: <IconCinema size={18} />,
    title: 'Watch Party',
    summary: 'Vídeo local, reprodução coordenada.',
    text: 'Assista a vídeos locais MP4 ou WebM de até 20 MiB, com aceite individual. Quem inicia controla a reprodução para todos; cada pessoa ajusta o próprio volume. A sincronização é aproximada.',
    figure: 'Palco no modo Vídeo compartilhado: reprodutor com linha do tempo, botão Pausar para todos, estado da sincronização e volume individual.',
  },
] as const;
type SceneId = typeof SCENES[number]['id'];

export function ProductShowcase({ heading }: { heading: React.ReactNode }) {
  const [scene, setScene] = useState<SceneId>('screen');
  const [ref, reveal] = useReveal<HTMLDivElement>();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = SCENES.find(item => item.id === scene)!;

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = SCENES.length - 1;
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = (next + SCENES.length) % SCENES.length;
    setScene(SCENES[target].id);
    tabs.current[target]?.focus();
  };

  return <div ref={ref} className={styles.showcase} data-reveal={reveal}>
    <div className={styles.intro}>
      {heading}
      <div role="tablist" aria-label="Recursos da sala" className={styles.sceneTabs}>
        {SCENES.map((item, index) => <button
          key={item.id}
          ref={element => { tabs.current[index] = element; }}
          type="button"
          role="tab"
          id={`demo-tab-${item.id}`}
          aria-controls="demo-panel"
          aria-selected={scene === item.id}
          tabIndex={scene === item.id ? 0 : -1}
          className={styles.sceneTab}
          onClick={() => setScene(item.id)}
          onKeyDown={event => onKeyDown(event, index)}
        >
          <span className={styles.sceneIcon} aria-hidden="true">{item.icon}</span>
          <span className={styles.sceneLabel}><b>{item.title}</b><small>{item.summary}</small></span>
        </button>)}
      </div>
    </div>
    <div role="tabpanel" id="demo-panel" tabIndex={0} aria-labelledby={`demo-tab-${scene}`} className={styles.scenePanel}>
      <figure className={styles.stageFrame} aria-label="Demonstração ilustrativa da sala">
        <div className={styles.stage} data-scene={scene} aria-hidden="true" inert>
          <StageNav watch={scene === 'watch'} />
          <span className={styles.streams}>
            <span className={styles.letterbox}><CodeScreen annotate={scene === 'screen' && reveal !== 'pending'} /></span>
            <StreamerBadge name={PRESENTER} />
            <span className={styles.qualityPill}><IconSignal size={13} />Tela com áudio</span>
            <ViewRail />
            <ChatPanel />
            <span className={styles.reaction}><span>👏</span>Joenho</span>
          </span>
          <WatchScene />
          <Dock />
        </div>
        <figcaption>
          <span className={styles.srOnly}>{active.figure} </span>
          <span key={scene} className={styles.sceneText}>{active.text}</span>
          {/* Sem JavaScript as abas não alternam; os demais estados continuam descritos. */}
          <noscript>{SCENES.filter(item => item.id !== scene).map(item => <span key={item.id} className={styles.sceneText}><b>{item.title}.</b> {item.text}</span>)}</noscript>
          <span className={styles.demoNote}>Demonstração ilustrativa · nenhuma sala conectada</span>
        </figcaption>
      </figure>
    </div>
  </div>;
}

export function CompareShowcase() {
  const [ref, reveal] = useReveal<HTMLElement>(0.35);
  const [comparing, setComparing] = useState(true);
  const userChose = useRef(false);

  // Abaixo da dobra, a demonstração começa com uma transmissão e passa para duas ao aparecer.
  useEffect(() => {
    if (userChose.current) return;
    if (reveal === 'pending') setComparing(false);
    if (reveal !== 'play') return;
    const timer = setTimeout(() => { if (!userChose.current) setComparing(true); }, 650);
    return () => clearTimeout(timer);
  }, [reveal]);

  const choose = (value: boolean) => { userChose.current = true; setComparing(value); };

  return <section ref={ref} className={styles.compareFeature} aria-labelledby="compare-title" data-reveal={reveal}>
    <div className={styles.compareCopy}>
      <IconCompare size={28} aria-hidden="true" />
      <Title order={3} id="compare-title">Duas telas.<br />Lado a lado.</Title>
      <Text>No modo Comparar, acompanhe duas transmissões ao mesmo tempo. Escolha o destaque e qual áudio ouvir.</Text>
      <Text className={styles.compareDetail}>Várias pessoas podem apresentar na mesma sala.</Text>
      <div className={styles.compareToggle} role="group" aria-label="Demonstração do modo Comparar">
        <button type="button" aria-pressed={!comparing} onClick={() => choose(false)}>Uma transmissão</button>
        <button type="button" aria-pressed={comparing} onClick={() => choose(true)}>Comparar</button>
      </div>
    </div>
    <figure className={styles.compareFigure}>
      <div className={styles.compareStage} data-comparing={comparing || undefined} aria-hidden="true" inert>
        <span className={styles.comparePanel}>
          <span className={styles.letterbox}><CodeScreen /></span>
          <StreamerBadge name={PRESENTER} />
          <span className={styles.compareHeader}>
            <span className={styles.selectorPill}><span className={styles.roleTag} data-role="primary"><i />Principal</span><span className={styles.select}>{PRESENTER}<IconChevronDown size={11} /></span></span>
            <span className={styles.metaBadge}><IconSignal size={11} />Com áudio</span>
          </span>
          <span className={styles.miniRail}>
            <RailButton active><IconVolume size={14} /></RailButton>
            <RailButton active={comparing}><IconCompare size={14} /></RailButton>
          </span>
        </span>
        <span className={styles.comparePanel}>
          <span className={styles.letterbox}><CharacterScreen /></span>
          <span className={styles.compareHeader}>
            <span className={styles.selectorPill}><span className={styles.roleTag} data-role="secondary"><i />Secundária</span><span className={styles.select}>Hanzinza<IconChevronDown size={11} /></span></span>
            <span className={styles.metaBadge}>Áudio secundário</span>
          </span>
        </span>
      </div>
      {/* As duas legendas ocupam a mesma célula: a altura não muda ao alternar a demonstração. */}
      <figcaption className={styles.compareCaption}>
        <span aria-hidden={!comparing} data-visible={comparing || undefined}>Ilustração do modo Comparar · código da ficha na tela de Firminha e o resultado na tela de Hanzinza, com o áudio de uma das transmissões</span>
        <span aria-hidden={comparing} data-visible={!comparing || undefined}>Ilustração do palco com uma transmissão em destaque · o botão Comparar abre a segunda transmissão</span>
      </figcaption>
    </figure>
  </section>;
}

type DeliveryState = 'waiting' | 'transferring' | 'complete';
const DELIVERY_LABELS: Record<DeliveryState, string> = { waiting: 'Aguardando aceitação', transferring: 'Transferindo', complete: 'Concluído' };

function AttachmentIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2" /><path d="m6 15 9-9" /></svg>;
}

export function SharingShowcase() {
  const [filesRef, filesReveal] = useReveal<HTMLElement>(0.3);
  const [clipsRef, clipsReveal] = useReveal<HTMLElement>(0.3);
  const deliveries: [string, DeliveryState][] = [['Hanzinza', 'complete'], ['Frisquila', 'transferring'], ['BetoBetas', 'waiting']];

  return <div className={styles.sharing}>
    <section ref={filesRef} className={styles.filesFeature} aria-labelledby="files-title" data-reveal={filesReveal}>
      <div className={styles.sharingCopy}>
        <Title order={3} id="files-title">Arquivos, com aceite individual</Title>
        <Text>Envie arquivos de até 20 MiB pelo chat e escolha os destinatários. Cada pessoa decide se aceita; a entrega só aparece para ela e para você.</Text>
      </div>
      <div className={styles.filesVisual} aria-hidden="true">
        <div className={styles.fileColumn}>
          <small className={styles.viewLabel}>Na sua tela</small>
          <span className={styles.fileCard}>
            <span className={styles.fileHeader}><AttachmentIcon /><span><b>mapa-da-masmorra.pdf</b><small>2.40 MiB · Privado</small></span></span>
            <small className={styles.fileContext}>Você → 3 destinatários</small>
            {deliveries.map(([person, state]) => <span key={person} className={styles.delivery}>
              <b>{person}</b>
              <span data-state={state}>{DELIVERY_LABELS[state]}{state === 'transferring' && ' · 64%'}</span>
              {state === 'transferring' && <span className={styles.progress}><i /></span>}
            </span>)}
          </span>
        </div>
        <div className={styles.fileColumn}>
          <small className={styles.viewLabel}>Na tela de BetoBetas</small>
          <span className={`${styles.fileCard} ${styles.incoming}`}>
            <span className={styles.fileHeader}><AttachmentIcon /><span><b>mapa-da-masmorra.pdf</b><small>2.40 MiB · Privado</small></span></span>
            <small className={styles.fileContext}>De Firminha para você</small>
            <span className={styles.delivery}>
              <span data-state="offered">Solicitação recebida</span>
              <small className={styles.fileHint}>Baixe somente se confiar no remetente.</small>
              <span className={styles.fileTools}><span data-primary>Aceitar</span><span>Recusar</span></span>
            </span>
          </span>
        </div>
      </div>
    </section>

    <section ref={clipsRef} className={styles.clipsFeature} aria-labelledby="clips-title" data-reveal={clipsReveal}>
      <div className={styles.clipVisual} aria-hidden="true">
        <span className={styles.clipFrame}>
          <span className={styles.letterbox}><CharacterScreen /></span>
          <span className={styles.ambientPill}>Fonte do clipe: Firminha (você)</span>
          <span className={styles.previewControls}><IconPlay size={13} /><small>0:00 / 0:42</small><span className={styles.previewTrack} /><IconVolume size={14} /></span>
        </span>
        <span className={styles.clipTimeline}>
          <span className={styles.clipRange}><i /></span>
          <span className={styles.clipScale}><small>Clipe local · 42 s</small><small>até 60 s</small></span>
        </span>
        <span className={styles.clipPreview}>
          <small>Prévia somente neste dispositivo. Nada é enviado ao servidor. Formato: WEBM.</small>
          <span className={styles.clipActions}><span>Salvar clipe</span><span>Enviar no Chat</span><span>Assistir juntos</span><span>Descartar clipe</span></span>
        </span>
      </div>
      <div className={styles.sharingCopy}>
        <Title order={3} id="clips-title">Guarde um trecho em clipe</Title>
        <Text>Grave até 60 segundos de uma transmissão, localmente e com permissão do apresentador. Revise a prévia e salve o trecho, envie seus próprios clipes pelo chat ou assista com a sala.</Text>
      </div>
    </section>
  </div>;
}
