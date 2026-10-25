/* Protótipo F14 — dados demonstrativos e construtores compartilhados. Não faz signaling nem P2P. */
const SR = (() => {
  const q = new URLSearchParams(location.search);
  const I = (name, size = 20, attrs = '') => {
    const inner = (window.ICONS || {})[name] || '';
    const fill = name === 'Cinema' ? '' : '';
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${attrs}>${inner}</svg>`;
  };
  const play = (s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m7 4 14 8-14 8z"/></svg>`;
  const pause = (s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>`;
  const warnI = (s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 7v6M12 17h.01"/></svg>`;
  const lock = (s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;

  // --- avatar (mesma paleta do produto: utils/avatar.ts) ---
  const PAL = [['#1e3a8a', '#93c5fd'], ['#312e81', '#c7d2fe'], ['#581c87', '#e9d5ff'], ['#701a75', '#f5d0fe'], ['#831843', '#fbcfe8'], ['#064e3b', '#6ee7b7'], ['#134e4a', '#5eead4'], ['#164e63', '#67e8f9'], ['#78350f', '#fde68a'], ['#7c2d12', '#fed7aa']];
  const col = (n) => { let h = 0; for (let i = 0; i < n.length; i++) { h = (h << 5) - h + n.charCodeAt(i); h |= 0; } return PAL[Math.abs(h) % PAL.length]; };
  const ini = (n) => { const p = n.trim().split(/\s+/); return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase(); };
  const av = (name, s = 32, extra = '') => { const [bg, tx] = col(name); return `<span class="av" style="width:${s}px;height:${s}px;background:${bg};color:${tx};font-size:${Math.round(s * .38)}px;${extra}" aria-hidden="true">${ini(name)}</span>`; };

  // --- arte demonstrativa (cenas sintéticas, rotuladas como tal no README) ---
  const uri = (s) => `url('data:image/svg+xml;utf8,${encodeURIComponent(s).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29')}')`;
  const sceneH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900"><defs>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14204a"/><stop offset=".38" stop-color="#6d3a78"/><stop offset=".62" stop-color="#e0735c"/><stop offset=".78" stop-color="#f8b25a"/></linearGradient>
<radialGradient id="g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".95"/><stop offset=".35" stop-color="#ffb35c" stop-opacity=".45"/><stop offset="1" stop-color="#ff8a4c" stop-opacity="0"/></radialGradient>
<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3f6e"/><stop offset=".35" stop-color="#14305a"/><stop offset="1" stop-color="#0a1830"/></linearGradient></defs>
<rect width="1600" height="900" fill="url(#s)"/><circle cx="1000" cy="520" r="520" fill="url(#g)"/><circle cx="1000" cy="540" r="92" fill="#ffe7a3"/>
<g fill="#fff" opacity=".13"><ellipse cx="300" cy="200" rx="260" ry="26"/><ellipse cx="520" cy="250" rx="200" ry="18"/><ellipse cx="1280" cy="170" rx="300" ry="24"/><ellipse cx="1180" cy="330" rx="220" ry="16"/></g>
<rect y="560" width="1600" height="340" fill="url(#w)"/>
<g fill="#ffd98a"><rect x="930" y="575" width="140" height="7" opacity=".7"/><rect x="900" y="600" width="200" height="6" opacity=".55"/><rect x="940" y="626" width="120" height="6" opacity=".5"/><rect x="880" y="652" width="240" height="5" opacity=".35"/><rect x="930" y="682" width="140" height="5" opacity=".3"/><rect x="900" y="715" width="200" height="4" opacity=".22"/></g>
<path d="M0 470 C120 440 210 470 300 520 C390 570 470 600 560 640 L620 900 L0 900Z" fill="#101a30"/><path d="M0 560 C140 540 260 590 380 650 L430 900 L0 900Z" fill="#0a1224"/>
<path d="M1600 600 C1500 590 1430 620 1380 660 L1330 900 L1600 900Z" fill="#0d1628"/>
<g transform="translate(760 604)"><path d="M0 14 L90 14 L76 32 L12 32Z" fill="#0a1224"/><path d="M44 12 L44 -48 L84 10Z" fill="#0f1a30" opacity=".95"/><path d="M42 12 L42 -36 L12 10Z" fill="#162340"/></g></svg>`;
  const sceneV = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1600" width="900" height="1600"><defs>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1236"/><stop offset=".5" stop-color="#3b2a6b"/><stop offset=".75" stop-color="#c8607a"/><stop offset=".9" stop-color="#f6a85c"/></linearGradient>
<linearGradient id="b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".85"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></linearGradient>
<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25306a"/><stop offset="1" stop-color="#0a1230"/></linearGradient></defs>
<rect width="900" height="1600" fill="url(#s)"/>
<g fill="#fff"><circle cx="120" cy="140" r="3"/><circle cx="300" cy="90" r="2"/><circle cx="700" cy="180" r="3"/><circle cx="560" cy="300" r="2"/><circle cx="800" cy="420" r="2"/><circle cx="180" cy="380" r="2"/><circle cx="420" cy="210" r="2"/></g>
<circle cx="700" cy="460" r="58" fill="#fff3d6" opacity=".92"/>
<polygon points="470,640 900,500 900,760" fill="url(#b)" opacity=".7"/>
<rect y="1180" width="900" height="420" fill="url(#w)"/>
<g stroke="#ffd98a" stroke-width="5" opacity=".28" stroke-linecap="round"><path d="M80 1260h200M420 1300h280M160 1360h160M520 1400h240M60 1460h260"/></g>
<path d="M120 1600 L220 1230 C300 1190 420 1170 540 1200 C640 1230 720 1340 760 1600Z" fill="#0b1226"/>
<path d="M360 1240 L384 700 L506 700 L530 1240Z" fill="#f4efe6"/><path d="M372 1010 L520 1010 L516 1090 L368 1090Z" fill="#c2403c"/><path d="M380 840 L510 840 L506 920 L384 920Z" fill="#c2403c"/>
<rect x="364" y="650" width="162" height="56" rx="6" fill="#1a2140"/><rect x="396" y="560" width="98" height="92" rx="10" fill="#ffd98a"/><path d="M380 560 L445 500 L510 560Z" fill="#1a2140"/></svg>`;
  const sceneCode = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900"><rect width="1600" height="900" fill="#0d1117"/><rect width="1600" height="56" fill="#161b22"/><g fill="#30363d"><circle cx="34" cy="28" r="7"/><circle cx="58" cy="28" r="7"/><circle cx="82" cy="28" r="7"/></g>
<text x="120" y="35" fill="#8c959f" font-family="monospace" font-size="22">peer-manager.ts — screen-room</text><rect y="56" width="330" height="844" fill="#0f141b"/>
<g font-family="monospace" font-size="24" fill="#8c959f"><text x="28" y="116">▾ src</text><text x="52" y="160">▾ features/room</text><text x="76" y="204" fill="#e6edf3">peer-manager.ts</text><text x="76" y="248">signaling-client.ts</text><text x="76" y="292">stats-collector.ts</text></g>
<g font-family="monospace" font-size="30"><text x="380" y="130" fill="#ff7b72">export async function</text><text x="380" y="180" fill="#d2a8ff">  shareScreen</text><text x="380" y="240" fill="#79c0ff">  const stream = await captureDisplay();</text><text x="380" y="290" fill="#79c0ff">  await peers.attachTracks(stream);</text><text x="380" y="340" fill="#79c0ff">  publishSharingState({ active: true });</text><text x="380" y="420" fill="#8b949e">  // Keep connections reusable after stop</text><text x="380" y="500" fill="#7ee787">$ pnpm test</text><text x="380" y="550" fill="#7ee787">✓ sharing · reconnection · cleanup</text></g></svg>`;
  const sceneFig = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900"><rect width="1600" height="900" fill="#1b1740"/><rect x="0" y="0" width="1600" height="64" fill="#26215a"/>
<g><rect x="140" y="150" width="380" height="640" rx="32" fill="#f4f1ff"/><rect x="170" y="190" width="320" height="170" rx="18" fill="#a78bfa"/><rect x="170" y="390" width="220" height="22" rx="11" fill="#312e81"/><rect x="170" y="430" width="320" height="16" rx="8" fill="#c4b5fd"/><rect x="170" y="466" width="260" height="16" rx="8" fill="#c4b5fd"/><rect x="170" y="680" width="320" height="64" rx="20" fill="#7c3aed"/></g>
<g><rect x="600" y="150" width="380" height="640" rx="32" fill="#f4f1ff"/><rect x="630" y="190" width="320" height="60" rx="16" fill="#e0d7ff"/><rect x="630" y="280" width="150" height="150" rx="20" fill="#c4b5fd"/><rect x="800" y="280" width="150" height="150" rx="20" fill="#a78bfa"/><rect x="630" y="460" width="320" height="16" rx="8" fill="#d8ccff"/></g>
<g><rect x="1060" y="150" width="400" height="640" rx="32" fill="#2e2870"/><circle cx="1260" cy="330" r="100" fill="#8b5cf6"/><rect x="1120" y="480" width="280" height="22" rx="11" fill="#c4b5fd"/><rect x="1150" y="530" width="220" height="16" rx="8" fill="#6d5fd0"/></g></svg>`;
  const ART = { h: uri(sceneH), v: uri(sceneV), code: uri(sceneCode), fig: uri(sceneFig) };

  // --- dados ---
  const VIDEO = {
    h: { name: 'Uma viagem pela costa.mp4', size: '14,2 MiB', sizeN: 14.2, duration: 432, ratio: '16 / 9', art: ART.h },
    v: { name: 'Farol ao entardecer.mp4', size: '8,6 MiB', sizeN: 8.6, duration: 128, ratio: '9 / 16', art: ART.v },
  };
  const ppl = {
    rafael: 'Rafael Mota', marina: 'Marina Alves', lucas: 'Lucas Pereira', bianca: 'Bianca Souza', thiago: 'Thiago Nunes', camila: 'Camila Ferraz', diego: 'Diego Martins',
  };
  // rótulos reais do produto (WatchParty.tsx)
  const L = { ready: 'Pronto para assistir', playing: 'Reproduzindo', buffering: 'Carregando no dispositivo', blocked: 'Aguardando ativação da reprodução', error: 'Vídeo indisponível neste navegador', waiting: 'Aguardando aceite', queued: 'Na fila', transferring: 'Transferindo', verifying: 'Verificando integridade', rejected: 'Recusado', none: 'Ainda sem convite' };
  // perfis de disponibilidade por cenário (visão de quem controla/assiste)
  const AVAIL = {
    invite: { marina: ['ready'], lucas: ['transferring', 64], bianca: ['queued'], thiago: ['waiting'], camila: ['rejected'], diego: ['none'] },
    live: { marina: ['playing'], lucas: ['buffering'], bianca: ['playing'], thiago: ['blocked'], camila: ['rejected'], diego: ['error'] },
    liveV: { marina: ['playing'], lucas: ['playing'], bianca: ['playing'], thiago: ['ready'], camila: ['rejected'], diego: ['none'] },
  };
  const GROUPS = { ready: 'a', playing: 'a', buffering: 'b', blocked: 'b', waiting: 'b', queued: 'b', transferring: 'b', verifying: 'b', rejected: 'c', error: 'c', none: 'c' };
  const TONE = { ready: 'ok', playing: 'ok', buffering: 'warn', blocked: 'warn', waiting: '', queued: '', transferring: '', verifying: '', rejected: 'bad', error: 'bad', none: '' };
  const GTITLE = { a: 'Assistindo', b: 'A caminho', c: 'Indisponíveis' };
  const endIcon = (st, pct) => st === 'ready' || st === 'playing' ? `<span class="pend ok" aria-label="Preparado">${I('Check', 15)}</span>`
    : st === 'transferring' ? `<span class="pend run" style="--p:${pct}%" aria-label="${pct}%"></span>`
    : st === 'buffering' || st === 'blocked' ? `<span class="pend warn">${warnI(15)}</span>`
    : st === 'waiting' || st === 'queued' || st === 'verifying' ? `<span class="pend wait" aria-hidden="true"></span>`
    : `<span class="pend bad">${I('Close', 14)}</span>`;
  const prow = (key, [st, pct], opts = {}) => {
    const name = ppl[key]; const label = st === 'transferring' ? `${L[st]} · ${pct}%` : L[st];
    return `<div class="prow">${av(name, 36)}<div class="pi"><div class="pn"><span class="ellip">${name}</span>${opts.you ? '<em>você</em>' : ''}</div><div class="ps ${TONE[st]}">${label}</div>${st === 'transferring' ? `<div class="bar" role="progressbar" aria-label="Progresso para ${name}" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>` : ''}</div>${endIcon(st, pct)}</div>`;
  };
  const counts = (av) => { const v = Object.values(av); return { total: v.length, ok: v.filter(x => GROUPS[x[0]] === 'a').length, bad: v.filter(x => GROUPS[x[0]] === 'c').length }; };
  const time = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // --- cenários (estados de produto) ---
  const S = {
    'streams-empty': { label: 'Transmissões · sala sem transmissão', view: 'streams', live: false },
    'streams-live': { label: 'Transmissões · com transmissões, sem sessão', view: 'streams', live: true },
    'pick': { label: 'Watch Party · escolher vídeo', view: 'watch', pick: 'idle' },
    'pick-busy': { label: 'Watch Party · preparando vídeo', view: 'watch', pick: 'busy' },
    'pick-error': { label: 'Watch Party · arquivo acima do limite', view: 'watch', pick: 'error' },
    'invite': { label: 'Controlador · convites e transferência', view: 'watch', vid: 'h', role: 'ctl', playing: false, pos: 0, avail: 'invite', panel: true },
    'play-h': { label: 'Controlador · vídeo horizontal', view: 'watch', vid: 'h', role: 'ctl', playing: true, pos: 184, avail: 'live' },
    'play-v': { label: 'Controlador · vídeo vertical', view: 'watch', vid: 'v', role: 'ctl', playing: true, pos: 47, avail: 'liveV' },
    'view-h': { label: 'Espectador · vídeo horizontal', view: 'watch', vid: 'h', role: 'spec', playing: true, pos: 184, avail: 'live' },
    'view-v': { label: 'Espectador · vídeo vertical', view: 'watch', vid: 'v', role: 'spec', playing: true, pos: 47, avail: 'liveV' },
    'offer': { label: 'Espectador · convite e consentimento', view: 'watch', vid: 'h', role: 'spec', phase: 'offer', avail: 'live' },
    'transfer': { label: 'Espectador · recebendo o vídeo', view: 'watch', vid: 'h', role: 'spec', phase: 'transfer', pct: 64, avail: 'live' },
    'blocked': { label: 'Espectador · reprodução bloqueada', view: 'watch', vid: 'h', role: 'spec', playing: true, pos: 184, phase: 'blocked', avail: 'live' },
    'people': { label: 'Participantes · preparados e indisponíveis', view: 'watch', vid: 'h', role: 'ctl', playing: true, pos: 184, avail: 'live', panel: true },
    'away': { label: 'Sessão ativa · voltei às transmissões (controlador)', view: 'streams', live: true, vid: 'h', role: 'ctl', playing: true, pos: 184, avail: 'live', session: true },
    'away-spec': { label: 'Sessão ativa · voltei às transmissões (espectador)', view: 'streams', live: true, vid: 'h', role: 'spec', playing: true, pos: 184, avail: 'live', session: true },
    'full-h': { label: 'Tela cheia · vídeo horizontal', view: 'watch', vid: 'h', role: 'ctl', playing: true, pos: 184, avail: 'live', full: true },
    'full-v': { label: 'Tela cheia · vídeo vertical', view: 'watch', vid: 'v', role: 'ctl', playing: true, pos: 47, avail: 'liveV', full: true },
    'chat': { label: 'Com chat aberto', view: 'watch', vid: 'h', role: 'ctl', playing: true, pos: 184, avail: 'live', chat: true },
  };
  const key = q.get('s') || 'streams-empty';
  const st = Object.assign({ playing: false, pos: 0, pct: 0 }, S[key] || S['streams-empty']);
  st.key = key;
  st.panel = q.get('panel') === '1' ? true : q.get('panel') === '0' ? false : st.panel;
  st.static = q.get('static') === '1';
  st.me = st.role === 'spec' ? 'marina' : 'rafael';
  if (st.vid) { st.video = VIDEO[st.vid]; st.av = AVAIL[st.avail] || AVAIL.live; }
  const href = (s, extra = '') => `?s=${s}${extra}`;

  // --- partes de página ---
  const header = (watchRight = '') => `<header class="hdr">
    <div class="logo"><i>${I('Screen', 16)}</i><span class="d-only">Screen Room</span></div>
    <span class="roompill"><span class="d-only">sala •</span> <b>4ffb7c52</b> ${I('Copy', 14)}</span>
    <span class="sp"></span><span class="conn d-only">Conectado</span><span class="conn m-only" style="padding:0 9px"></span>
    <span class="tools"><button aria-label="Chat">${I('Chat', 18)}</button><hr><button aria-label="Levantar a mão">${I('Hand', 18)}</button><hr class="d-only"><button class="d-only" aria-label="Reações">${I('Smile', 18)}</button></span>
    <button class="hbtn" aria-label="Participantes">${I('Users', 16)} ${S[key].view && st.role ? 7 : 7}</button>
    <button class="hbtn d-only" aria-label="Configurações">${I('Gear', 17)}</button><button class="hbtn ghost" aria-label="Mais">${I('Dots', 18)}</button></header>`;
  const dock = (opts = {}) => `<div class="dock" role="toolbar" aria-label="Controles da sala"><button class="share">${I('Screen', 17)}<span>${opts.sharing ? 'Parar' : 'Compartilhar'}</span></button><button class="ic" aria-label="Copiar convite">${I('Link', 18)}</button><button class="ic" aria-label="Participantes">${I('Users', 18)}</button><button class="ic" aria-label="Configurações">${I('Gear', 18)}</button><button class="ic exit" aria-label="Sair da sala">${I('Exit', 18)}</button></div>`;
  const chatPanel = () => `<aside class="chat" id="room-chat-panel" aria-label="Chat"><h3>Chat <button class="iconbtn" aria-label="Fechar chat">${I('Close', 18)}</button></h3><div class="msgs">
    <div class="msg"><b>Marina Alves</b><p>Cheguei! Já aceitei o vídeo 🙌</p></div><div class="msg"><b>Lucas Pereira</b><p>Aqui carregando ainda, uns 30s</p></div><div class="msg"><b>Rafael Mota</b><p>Sem pressa, aguardo vocês antes de dar play.</p></div></div><div class="compose">Escreva uma mensagem…</div></aside>`;
  // relógio local do protótipo (só avança a linha do tempo quando está “reproduzindo”)
  const clock = (apply) => {
    if (!st.playing || st.static || !st.video) return;
    const t0 = performance.now(); const base = st.pos;
    setInterval(() => apply(Math.min(st.video.duration, base + (performance.now() - t0) / 1000)), 500);
  };
  const paint = (el, v) => el && el.style.setProperty('--v', v + '%');
  return { q, I, play, pause, warnI, lock, av, ART, VIDEO, ppl, L, AVAIL, GROUPS, TONE, GTITLE, prow, counts, time, S, st, key, href, header, dock, chatPanel, clock, paint, endIcon };
})();
