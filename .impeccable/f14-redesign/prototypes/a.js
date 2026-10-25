/* Conceito A revisado — Sala de cinema integrada ao palco
   Direção aprovada: Mídia protagonista, acesso pelo estado vazio ("Assistir vídeo com a sala"),
   seletor compacto de conteúdo no palco, sem mini-player ao retornar às transmissões. */
(() => {
  const { st, I, av, ART, prow, counts, time, href, paint } = SR;
  const app = document.getElementById('app');
  const mobile = () => innerWidth <= 900;
  const narrow = () => innerWidth <= 420;
  const hasSession = !!st.vid;
  const spec = st.role === 'spec';
  const ctl = !spec;
  const onWatch = st.view === 'watch';
  const onStreams = !onWatch;
  const isLiveStreams = !!st.live;
  const nOthers = 6;
  const toWatch = hasSession ? `${spec ? 'view' : 'play'}-${st.vid}` : 'pick';
  const toStreams = hasSession ? (spec ? 'away-spec' : 'away') : 'streams-live';
  const cnt = st.av ? counts(st.av) : { ok: 0, total: nOthers, bad: 0 };

  /* ---------- Seletor de Conteúdo do Palco (Compacto, integrado e consistente) ---------- */
  const stageSelector = () => {
    // Não exibe seletor no estado vazio de transmissões (o acesso é pelo card central)
    if (!isLiveStreams && !hasSession && !onWatch) return '';
    const streamsActive = onStreams;
    const watchActive = onWatch;
    const sessionDot = hasSession ? `<span class="live-pip" title="Sessão de vídeo ativa" aria-hidden="true"></span>` : '';
    const sessionTc = hasSession && streamsActive ? `<span class="live-tc">${time(st.pos)}</span>` : '';
    const watchLabel = hasSession ? 'Vídeo compartilhado' : (narrow() ? 'Vídeo' : 'Assistir vídeo com a sala');
    const streamsLabel = narrow() ? 'Telas' : 'Transmissões';
    const streamCount = isLiveStreams ? (narrow() ? '' : '<span class="count-tag">1</span>') : '';

    return `<nav class="stage-nav" aria-label="Conteúdo do palco">
      <a class="stage-tab ${streamsActive ? 'selected' : ''}" href="${href(toStreams)}" ${streamsActive ? 'aria-current="page"' : ''} title="Ver transmissões de tela">
        ${I('Screen', 15)}<span>${streamsLabel}</span>${streamCount}
      </a>
      <a class="stage-tab ${watchActive ? 'selected' : ''} ${hasSession ? 'has-session' : ''}" href="${href(toWatch)}" ${watchActive ? 'aria-current="page"' : ''} title="${hasSession ? 'Sessão de vídeo ativa' : 'Iniciar vídeo compartilhado'}">
        ${I('Cinema', 15)}<span>${watchLabel}</span>${sessionDot}${sessionTc}
      </a>
    </nav>`;
  };

  /* ---------- Estado Vazio das Transmissões ---------- */
  const emptyStreams = () => `
    <div class="empty-stage">
      <div class="empty-icon-box">${I('Screen', 40)}</div>
      <h2>Nenhuma transmissão ativa</h2>
      <p>Quando alguém compartilhar a tela, ela aparecerá aqui automaticamente.</p>
      <div class="empty-actions">
        <button class="btn btn-primary" onclick="alert('Compartilhamento de tela acionado')">
          ${I('Screen', 17)}<span>Compartilhar tela</span>
        </button>
        <a class="btn btn-secondary" href="${href('pick')}" data-testid="empty-watch-entry">
          ${I('Cinema', 17)}<span>Assistir vídeo com a sala</span>
        </a>
      </div>
      <div class="empty-aux-actions">
        <button class="btn btn-aux">${I('Link', 16)}<span>Copiar convite</span></button>
        <button class="btn btn-aux">${I('QrCode', 16)}<span>Mostrar QR Code</span></button>
      </div>
    </div>`;

  /* ---------- Outras Transmissões (Sidebar / Trilho) ---------- */
  const rail = () => `
    <aside class="stream-rail" aria-label="Outras transmissões">
      <h3>Outras transmissões (1)</h3>
      <div class="stream-tile">
        <div class="tile-thumb" style="background-image:${ART.fig}">
          <span class="tile-tag">Destacar</span>
        </div>
        <div class="tile-meta">${av('Ana Ribeiro', 20)}<b>Ana Ribeiro</b></div>
      </div>
      <span class="rail-spacer"></span>
      <div class="rail-watching"><span>Assistindo</span><b>+3</b></div>
    </aside>`;

  /* ---------- Tela de Transmissões ---------- */
  const streams = () => `
    <div class="streams-view ${st.live ? 'has-live' : ''}">
      <div class="streams-main">
        ${st.live ? `
          <div class="stream-shot" style="background-image:${ART.code}"></div>
          <div class="stage-streamer-badge">
            ${av('Carlos Lima', 22)}
            <span class="ellip">Carlos Lima · Transmitindo</span>
            <span class="live-dot" title="Ao vivo"></span>
          </div>
          <div class="stage-tools">
            <span class="tool-pill d-only">${I('Signal', 13)} Tela • Ao vivo</span>
            <button class="iconbtn glass" aria-label="Modo Cinema">${I('Cinema', 18)}</button>
            <button class="iconbtn glass" aria-label="Tela cheia">${I('Maximize', 18)}</button>
          </div>
        ` : emptyStreams()}
      </div>
      ${st.live && !mobile() ? rail() : ''}
      ${st.live && mobile() ? `
        <div class="mobile-stream-strip">
          <div class="stream-tile">
            <div class="tile-thumb" style="background-image:${ART.fig}"><span class="tile-tag">Destacar</span></div>
            <div class="tile-meta">${av('Ana Ribeiro', 18)}<b>Ana</b></div>
          </div>
        </div>
      ` : ''}
    </div>`;

  /* ---------- Watch Party: Telas de Preparação e Consentimento ---------- */
  const shield = `<p class="consent-notice">${I('Shield', 16)}<span>Cada pessoa escolhe se deseja receber o vídeo. O arquivo fica apenas temporariamente nesta página.</span></p>`;
  const crewLine = () => `<div class="crew-hint"><span class="crew-stack">${['Marina Alves', 'Lucas Pereira', 'Bianca Souza', 'Thiago Nunes'].map(n => av(n, 26)).join('')}<span class="more">+2</span></span><span>Marina, Lucas e mais 4 receberão um convite quando você escolher o vídeo.</span></div>`;

  const pick = () => {
    const busy = st.pick === 'busy', err = st.pick === 'error';
    const file = busy ? { n: 'Uma viagem pela costa.mp4', s: '14,2 MiB' } : { n: 'Farol-ao-entardecer-4k.mp4', s: '34,2 MiB' };
    return `
      <div class="stagecard">
        <section class="prep-box" aria-label="Preparação do vídeo compartilhado">
          <div class="prep-icon">${I('Cinema', 34)}</div>
          <h2>Seu vídeo. A sala inteira.</h2>
          <p class="prep-lede">Escolha um vídeo para assistir juntos.<br>Você dá o play e controla a reprodução da sala.</p>
          ${busy || err ? `<div class="file-chip ${err ? 'err' : ''}">${I('Cinema', 18)}<span class="ellip">${file.n}</span><em>${file.s}</em></div>` : ''}
          ${busy ? `<div class="prep-status" role="status"><div class="bar ind"><i></i></div><span>Verificando e preparando vídeo…</span></div>` : ''}
          ${err ? `<div class="alert-box" role="alert">${SR.warnI(18)}<span>O arquivo tem 34,2 MiB e o limite é 20 MiB. Escolha outro vídeo MP4 ou WebM.</span></div>` : ''}
          <div class="prep-actions">
            <button class="btn btn-primary big" ${busy ? 'disabled' : ''}>
              ${I('Cinema', 18)}<span>${busy ? 'Preparando vídeo…' : err ? 'Selecionar outro vídeo' : 'Selecionar vídeo local'}</span>
            </button>
            <a class="btn btn-subtle" href="${href('streams-live')}">Cancelar</a>
          </div>
          <small class="fmt-hint">MP4 ou WebM · até 20 MiB</small>
        </section>
        ${shield}
        ${crewLine()}
      </div>`;
  };

  const offer = () => `
    <div class="stagecard">
      <section class="prep-box" aria-label="Convite para vídeo compartilhado">
        <div class="prep-icon">${I('Cinema', 34)}</div>
        <h2>Vamos assistir juntos?</h2>
        <p class="prep-lede">Rafael quer assistir a um vídeo com você. Aceite receber o arquivo para acompanhar a sessão.</p>
        <div class="file-chip">${I('Cinema', 18)}<span class="ellip">${st.video.name}</span><em>${st.video.size}</em></div>
        <div class="prep-actions row">
          <button class="btn btn-primary big" onclick="location.search='${href('transfer')}'">Aceitar vídeo</button>
          <button class="btn btn-subtle big" onclick="location.search='${href('streams-live')}'">Recusar vídeo</button>
        </div>
      </section>
      ${shield}
    </div>`;

  const transfer = () => `
    <div class="stagecard">
      <section class="prep-box" aria-label="Recebendo o vídeo compartilhado">
        <div class="prep-icon">${I('Cinema', 34)}</div>
        <h2>Transferindo vídeo</h2>
        <p class="prep-lede">Você poderá assistir assim que o vídeo estiver pronto.</p>
        <div class="file-chip">${I('Cinema', 18)}<span class="ellip">${st.video.name}</span><em>${st.video.size}</em></div>
        <div class="xfer-block" role="status">
          <div class="xfer-label"><span>Transferindo</span><b>${st.pct}%</b></div>
          <div class="bar big" role="progressbar" aria-label="Progresso do vídeo" aria-valuenow="${st.pct}"><i style="width:${st.pct}%"></i></div>
          <ol class="step-trail">
            <li class="done">Convite aceito</li>
            <li class="on">Transferindo</li>
            <li>Integridade</li>
            <li>Pronto</li>
          </ol>
        </div>
      </section>
      <p class="consent-notice">${I('Shield', 16)}<span>O vídeo fica temporariamente nesta página. Se algo falhar, peça a Rafael um novo convite.</span></p>
    </div>`;

  /* ---------- Controles de Reprodução e Transporte ---------- */
  const ctrl = () => {
    const v = st.video;
    const pct = 100 * st.pos / v.duration;
    const status = st.phase === 'blocked' ? 'Reprodução bloqueada pelo navegador' : st.playing ? 'Reproduzindo · sincronização aproximada' : 'Pausado para a sala';
    return `
      <div class="transport-bar" role="region" aria-label="Controles de reprodução do vídeo">
        <div class="timeline-row">
          <span class="t-val" id="tcur">${time(st.pos)}</span>
          <input class="rng" id="seek" type="range" min="0" max="${v.duration}" value="${st.pos}" aria-label="Posição do vídeo" ${spec ? 'disabled aria-describedby="seekhint"' : ''} style="--v:${pct}%">
          <span class="t-val dim">${time(v.duration)}</span>
        </div>
        <div class="controls-row">
          ${ctl ? `
            <button class="btn btn-primary play-btn" aria-label="${st.playing ? 'Pausar para todos' : 'Reproduzir para todos'}">
              ${st.playing ? SR.pause(18) : SR.play(18)}
              <span>${st.playing ? 'Pausar' : 'Reproduzir'}<span class="fe"> para todos</span></span>
            </button>
          ` : `
            <span class="authority-badge" id="seekhint">
              ${SR.lock(14)}
              <span>Rafael controla</span>
            </span>
          `}
          <span class="status-msg" role="status">${status}</span>
          <div class="local-audio" role="group" aria-label="Áudio neste dispositivo">
            <button class="iconbtn glass" aria-label="Silenciar áudio local">${I('Volume', 20)}</button>
            <label>
              <span class="sr">Volume local</span>
              <input class="rng vol" type="range" min="0" max="1" step=".05" value=".8" style="--v:80%">
            </label>
            <small class="d-only">Só você</small>
          </div>
        </div>
      </div>`;
  };

  const veil = () => st.phase === 'blocked' ? `
    <div class="blocked-veil">
      <button class="big-play-btn" aria-label="Ativar reprodução neste dispositivo">${SR.play(32)}</button>
      <p>O navegador precisa da sua permissão para reproduzir o vídeo aqui.</p>
      <button class="btn btn-primary">Ativar reprodução neste dispositivo</button>
    </div>` : '';

  /* ---------- Participantes e Drawer Contextual ---------- */
  const crewBtn = () => `
    <button class="crew-pill" aria-label="Participantes da sessão: ${cnt.ok} de ${nOthers} prontos" aria-expanded="${!!st.panel}" onclick="location.search='${href(st.key, st.panel ? '&panel=0' : '&panel=1')}'">
      <span class="crew-avatars">${['Marina Alves', 'Lucas Pereira', 'Bianca Souza'].map(n => av(n, 24)).join('')}</span>
      <span class="crew-label">${cnt.ok}/${nOthers}<span class="w"> prontos</span></span>
      ${cnt.bad ? `<i class="warn-dot" title="${cnt.bad} indisponíveis"></i>` : ''}
      ${I('ChevronDown', 13)}
    </button>`;

  const selfRows = () => {
    const row = (name, sub, you) => `
      <div class="prow">${av(name, 36)}<div class="pi"><div class="pn"><span class="ellip">${name}</span>${you ? '<em>você</em>' : ''}</div><div class="ps">${sub}</div></div></div>`;
    return `<div class="people-self">${ctl ? row('Rafael Mota', 'Controla a reprodução', true) : row('Rafael Mota', 'Controla a reprodução', false) + row('Marina Alves', 'Assistindo', true)}</div>`;
  };

  const peopleList = (withEnd = true) => {
    const groups = { a: [], b: [], c: [] };
    Object.entries(st.av).filter(([k]) => !(spec && k === 'marina')).forEach(([k, a]) => groups[SR.GROUPS[a[0]]].push(prow(k, a)));
    const sec = (g) => groups[g].length ? `
      <section class="people-group">
        <h4>${SR.GTITLE[g]} <span>${groups[g].length}</span></h4>
        ${groups[g].join('')}
        ${g === 'c' && ctl ? `<button class="btn btn-secondary small wide">${I('Plus', 15)}Convidar indisponíveis</button>` : ''}
      </section>` : '';
    return `
      <div class="people-content">
        ${selfRows()}
        ${sec('a')}${sec('b')}${sec('c')}
        ${ctl && withEnd ? `<div class="end-zone"><button class="btn btn-danger wide">Encerrar Watch Party</button></div>` : ''}
      </div>`;
  };

  const drawer = () => `
    <aside class="context-drawer" aria-label="Participantes da Watch Party">
      <header>
        <h3>Na sessão <span>${cnt.ok}/${nOthers} prontos</span></h3>
        <button class="iconbtn" aria-label="Fechar participantes" onclick="location.search='${href(st.key, '&panel=0')}'">${I('Close', 18)}</button>
      </header>
      <div class="drawer-body">${peopleList()}</div>
    </aside>`;

  /* Console lateral para vídeo vertical no desktop */
  const sideConsole = () => `
    <aside class="side-console" aria-label="Controles e participantes">
      <div class="console-transport">${ctrl()}</div>
      <div class="console-people">
        <h3>Na sessão <span>${cnt.ok}/${nOthers} prontos</span></h3>
        ${peopleList(false)}
      </div>
      ${ctl ? `<div class="end-zone pinned"><button class="btn btn-danger wide">Encerrar Watch Party</button></div>` : ''}
    </aside>`;

  /* ---------- Cabeçalho Superior do Palco (Top Bar) ---------- */
  const topbar = (full) => `
    <div class="stage-topbar ${full ? 'fullscreen' : ''}">
      <div class="topbar-left">
        ${hasSession ? `
          <div class="video-meta-pill">
            <b class="ellip">${st.video.name}</b>
            <small>${ctl ? 'Você controla a reprodução' : 'Rafael controla a reprodução'}</small>
          </div>
        ` : ''}
      </div>
      <div class="topbar-center">${stageSelector()}</div>
      <div class="topbar-right">
        ${hasSession && !st.phase && !st.pick ? crewBtn() : ''}
        ${full ? `
          <button class="btn small glass">${I('Minimize', 16)}Sair da tela cheia</button>
        ` : `
          <button class="btn small glass d-only">${I('Cinema', 16)}Modo Cinema</button>
          <button class="btn small glass d-only">${I('Maximize', 16)}Tela cheia</button>
          <button class="iconbtn glass m-only" aria-label="Modo Cinema">${I('Cinema', 18)}</button>
          <button class="iconbtn glass m-only" aria-label="Tela cheia">${I('Maximize', 18)}</button>
        `}
      </div>
    </div>`;

  /* ---------- Corpo do Player Cinematográfico ---------- */
  const watchBody = () => {
    const full = st.full;
    if (!hasSession && !st.phase) {
      return `
        <div class="watch-cinema">
          <div class="amb idle"></div>
          ${topbar()}
          <div class="theater-center">${pick()}</div>
        </div>`;
    }
    if (st.phase === 'offer' || st.phase === 'transfer') {
      return `
        <div class="watch-cinema">
          <div class="amb idle"></div>
          ${topbar()}
          <div class="theater-center">${st.phase === 'offer' ? offer() : transfer()}</div>
          ${st.panel ? drawer() : ''}
        </div>`;
    }

    const v = st.video;
    const vertical = st.vid === 'v';
    const side = vertical && !mobile();
    const ar = vertical ? 0.5625 : 1.7778;
    const stageUi = `
      <div class="video-frame" style="background-image:${v.art}">
        ${veil()}
      </div>`;

    return `
      <div class="watch-cinema ${full ? 'is-full' : ''} ${vertical ? 'is-vert' : ''}">
        <div class="amb" style="background-image:${v.art}"></div>
        ${topbar(full)}
        <div class="theater-stage ${side ? 'has-side-console' : ''}" style="--ar:${ar}">
          <div class="player-unit ${st.phase === 'blocked' ? 'is-blocked' : ''}">
            ${stageUi}
            ${side ? '' : ctrl()}
          </div>
          ${side ? sideConsole() : ''}
        </div>
        ${!side && st.panel ? drawer() : ''}
      </div>`;
  };

  /* ---------- Render Principal ---------- */
  const render = () => {
    const showHdr = !st.full;
    app.innerHTML = `
      <div class="app a-revised">
        ${showHdr ? SR.header() : ''}
        <main class="stage ${st.chat ? 'chatting' : ''}">
          ${st.view === 'watch' ? watchBody() : streams()}
          ${st.view !== 'watch' ? `<div class="streams-selector-host">${stageSelector()}</div>` : ''}
          ${st.chat ? SR.chatPanel() : ''}
          ${st.full ? '' : SR.dock()}
        </main>
      </div>`;

    document.title = `Conceito A revisado · ${SR.S[st.key].label}`;

    SR.clock((t) => {
      paint(document.getElementById('seek'), 100 * t / st.video.duration);
      const s = document.getElementById('seek');
      if (s) s.value = t;
      const c = document.getElementById('tcur');
      if (c) c.textContent = time(t);
    });

    document.querySelectorAll('.rng').forEach(r => r.addEventListener('input', () => {
      const p = 100 * (r.value - r.min) / (r.max - r.min);
      paint(r, p);
    }));
  };

  render();
  let was = mobile();
  addEventListener('resize', () => {
    if (was !== mobile()) {
      was = mobile();
      render();
    }
  });
})();
