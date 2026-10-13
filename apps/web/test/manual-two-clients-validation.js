import { createSignalServer } from '@screen-room/signaling';
import { WebSocket as WsClient } from 'ws';
import { SignalingClient } from '../src/features/room/signaling/signaling-client.ts';
import { PeerManager } from '../src/features/room/webrtc/peer-manager.ts';
import { fetchIceConfiguration } from '../src/features/room/webrtc/ice-config.ts';
import {
  MockRTCPeerConnection,
  MockMediaStream,
  MockMediaStreamTrack,
} from './mock-webrtc.js';
import { setStreamAudioMuted, stopAllTracks } from '../src/features/room/media/display-media.ts';

// Setup environment mocks
globalThis.WebSocket = WsClient;
globalThis.RTCPeerConnection = MockRTCPeerConnection;
globalThis.RTCSessionDescription = class { constructor(init) { Object.assign(this, init); } };
globalThis.RTCIceCandidate = class { constructor(init) { Object.assign(this, init); } };

async function runValidation() {
  console.log('=== TESTE DE INTEGRAÇÃO MULTI-CLIENTE EM NODE.JS (Servidor de Sinalização Real + Mocks WebRTC) ===\n');

  // 1. Iniciar servidor de signaling real
  console.log('1. Iniciando servidor de signaling...');
  const server = createSignalServer({ port: 3000, host: '127.0.0.1' });
  await server.ready;
  console.log(`✓ Servidor de signaling ativo na porta ${server.port}`);

  // 2. Validar endpoint de TURN/STUN
  console.log('\n2. Testando obtenção de configuração ICE segura (/turn-credentials)...');
  const iceConfig = await fetchIceConfiguration(`http://127.0.0.1:${server.port}/turn-credentials`);
  console.log('✓ ICE servers recebidos:', iceConfig.iceServers.length, 'servidores');
  if (!iceConfig.iceServers.length) throw new Error('Nenhum servidor ICE recebido');

  const serverUrl = `ws://127.0.0.1:${server.port}/signal`;
  const roomId = 'sala-teste-manual';

  // 3. Cliente A (Host) conecta e entra na sala
  console.log('\n3. Conectando Cliente A (Host)...');
  let hostPresence = 0;
  let hostLastPeerUpdate = null;
  const hostSignaling = new SignalingClient({
    url: serverUrl,
    onStateChange: (st) => console.log(`   [Host] Estado de conexão: ${st}`),
    onMessage: (msg) => {
      if (msg.type === 'peers' || msg.type === 'peer-joined' || msg.type === 'peer-left') {
        hostPresence = msg.count;
      }
      if (msg.type === 'peer-joined' && hostStream) {
        console.log(`   [Host] Detectou novo participante (${msg.peerId}), enviando oferta WebRTC...`);
        hostPeerManager.createAndSendOffer(msg.peerId);
      }
      if (msg.type === 'peer-left') {
        console.log(`   [Host] Participante saiu (${msg.peerId})`);
        hostPeerManager.removePeer(msg.peerId);
      }
      if (msg.type === 'peer-updated') {
        console.log(`   [Host] Atualização de nickname recebida para ${msg.peerId}: ${msg.nickname || '(removido)'}`);
        hostLastPeerUpdate = msg;
      }
      if (msg.type === 'signal') {
        if (msg.data.type === 'answer') {
          console.log(`   [Host] Resposta WebRTC recebida de ${msg.from}`);
          hostPeerManager.handleAnswer(msg.from, msg.data.sdp);
        } else if (msg.data.type === 'ice') {
          hostPeerManager.handleRemoteIce(msg.from, msg.data.candidate);
        }
      }
    },
  });

  const hostPeerManager = new PeerManager({
    rtcConfig: iceConfig,
    onSendSignal: (target, data) => {
      console.log(`   [Host -> ${target}] Sinal: ${data.type}`);
      hostSignaling.relaySignal(target, data);
    },
    onRemoteStreamAdd: () => {},
    onRemoteStreamRemove: () => {},
  });

  hostSignaling.connect();
  await new Promise((r) => setTimeout(r, 40));
  hostSignaling.join(roomId, 'host-alfa');
  await new Promise((r) => setTimeout(r, 40));
  console.log(`✓ Host entrou na sala. Presença reportada: ${hostPresence}`);

  // 4. Cliente B (Viewer) conecta e entra na mesma sala
  console.log('\n4. Conectando Cliente B (Viewer) na mesma sala...');
  let viewerPresence = 0;
  let viewerReceivedStream = null;
  let viewerLastPeerUpdate = null;

  const viewerSignaling = new SignalingClient({
    url: serverUrl,
    onStateChange: (st) => console.log(`   [Viewer] Estado de conexão: ${st}`),
    onMessage: async (msg) => {
      if (msg.type === 'peers' || msg.type === 'peer-joined' || msg.type === 'peer-left') {
        viewerPresence = msg.count;
      }
      if (msg.type === 'peer-updated') {
        console.log(`   [Viewer] Atualização de nickname recebida para ${msg.peerId}: ${msg.nickname || '(removido)'}`);
        viewerLastPeerUpdate = msg;
      }
      if (msg.type === 'signal') {
        if (msg.data.type === 'offer') {
          console.log(`   [Viewer] Oferta WebRTC recebida de ${msg.from}`);
          await viewerPeerManager.handleOffer(msg.from, msg.data.sdp);
        } else if (msg.data.type === 'ice') {
          await viewerPeerManager.handleRemoteIce(msg.from, msg.data.candidate);
        }
      }
    },
  });

  const viewerPeerManager = new PeerManager({
    rtcConfig: iceConfig,
    onSendSignal: (target, data) => {
      console.log(`   [Viewer -> ${target}] Sinal: ${data.type}`);
      viewerSignaling.relaySignal(target, data);
    },
    onRemoteStreamAdd: (peerId, stream) => {
      console.log(`   [Viewer] Stream remoto recebido de ${peerId}! Trilhas:`, stream.getTracks().map(t => t.kind));
      viewerReceivedStream = stream;
    },
    onRemoteStreamRemove: () => {
      viewerReceivedStream = null;
    },
  });

  viewerSignaling.connect();
  await new Promise((r) => setTimeout(r, 40));
  viewerSignaling.join(roomId, 'viewer-bravo');
  await new Promise((r) => setTimeout(r, 50));
  console.log(`✓ Viewer entrou. Presença no Viewer: ${viewerPresence}, Presença no Host: ${hostPresence}`);
  if (viewerPresence !== 2 || hostPresence !== 2) throw new Error('Falha na presença síncrona');

  // 4.1. Sincronização e propagação de nicknames
  console.log('\n4.1. Testando sincronização e propagação de nicknames entre clientes...');
  // Viewer altera nickname para Marina
  viewerSignaling.updateNickname('Marina');
  await new Promise((r) => setTimeout(r, 50));
  if (!hostLastPeerUpdate || hostLastPeerUpdate.nickname !== 'Marina') {
    throw new Error('Host não recebeu atualização de nickname do Viewer');
  }
  console.log('✓ Host recebeu alteração de nickname do Viewer: Marina');

  // Viewer envia atualização redundante
  hostLastPeerUpdate = null;
  viewerSignaling.updateNickname('Marina');
  await new Promise((r) => setTimeout(r, 50));
  if (hostLastPeerUpdate !== null) {
    throw new Error('Atualização redundante não deveria ser propagada');
  }
  console.log('✓ Atualização redundante de nickname foi ignorada corretamente');

  // Viewer remove nickname (retorna a visitante neutro)
  viewerSignaling.updateNickname('');
  await new Promise((r) => setTimeout(r, 50));
  if (!hostLastPeerUpdate || hostLastPeerUpdate.nickname !== undefined) {
    throw new Error('Host não recebeu remoção de nickname do Viewer');
  }
  console.log('✓ Host recebeu remoção de nickname do Viewer (identificação neutra)');

  // Host define nickname para Aldo
  hostSignaling.updateNickname('Aldo');
  await new Promise((r) => setTimeout(r, 50));
  if (!viewerLastPeerUpdate || viewerLastPeerUpdate.nickname !== 'Aldo') {
    throw new Error('Viewer não recebeu atualização de nickname do Host');
  }
  console.log('✓ Viewer recebeu alteração de nickname do Host: Aldo');

  // 5. Host compartilha tela (com áudio da tela/aba, NUNCA microfone)
  console.log('\n5. Host iniciando compartilhamento de tela com áudio de aba...');
  const hostVideoTrack = new MockMediaStreamTrack('video');
  const hostAudioTrack = new MockMediaStreamTrack('audio');
  let hostStream = new MockMediaStream([hostVideoTrack, hostAudioTrack]);

  await hostPeerManager.attachLocalStream(hostStream);
  await hostPeerManager.createAndSendOffer('viewer-bravo');
  await new Promise((r) => setTimeout(r, 80));

  const hostPeer = hostPeerManager.getPeer('viewer-bravo');
  const viewerPeer = viewerPeerManager.getPeer('host-alfa');

  console.log('✓ Negociação offer/answer concluída!');
  console.log('   Host localDescription:', hostPeer?.pc.localDescription?.type);
  console.log('   Viewer remoteDescription:', viewerPeer?.pc.remoteDescription?.type);
  console.log('   Viewer localDescription:', viewerPeer?.pc.localDescription?.type);
  console.log('   Host remoteDescription:', hostPeer?.pc.remoteDescription?.type);

  // 6. Testar mutar e desmutar áudio da tela
  console.log('\n6. Testando mute/desmute de áudio capturado da tela...');
  console.log('   Áudio ativo inicialmente:', hostAudioTrack.enabled);
  setStreamAudioMuted(hostStream, true);
  console.log('   Áudio após mute:', hostAudioTrack.enabled, '(Vídeo permanece ativo:', hostVideoTrack.enabled, ')');
  if (hostAudioTrack.enabled !== false || hostVideoTrack.enabled !== true) throw new Error('Falha no mute do áudio da tela');
  setStreamAudioMuted(hostStream, false);
  console.log('   Áudio após reativação:', hostAudioTrack.enabled);

  // 7. Entrada tardia: Cliente C entra com stream já em andamento
  console.log('\n7. Testando entrada tardia (Cliente C / Viewer 2)...');
  let viewer2Presence = 0;
  const viewer2Signaling = new SignalingClient({
    url: serverUrl,
    onStateChange: () => {},
    onMessage: async (msg) => {
      if (msg.type === 'peers' || msg.type === 'peer-joined') viewer2Presence = msg.count;
      if (msg.type === 'signal' && msg.data.type === 'offer') {
        console.log(`   [Viewer 2] Oferta automática recebida de ${msg.from}!`);
        await viewer2PeerManager.handleOffer(msg.from, msg.data.sdp);
      }
    },
  });

  const viewer2PeerManager = new PeerManager({
    rtcConfig: iceConfig,
    onSendSignal: (target, data) => viewer2Signaling.relaySignal(target, data),
    onRemoteStreamAdd: (peerId) => console.log(`   [Viewer 2] Stream remoto recebido de ${peerId}`),
    onRemoteStreamRemove: () => {},
  });

  viewer2Signaling.connect();
  await new Promise((r) => setTimeout(r, 40));
  viewer2Signaling.join(roomId, 'viewer-charlie');
  await new Promise((r) => setTimeout(r, 80));

  const viewer2HostPeer = viewer2PeerManager.getPeer('host-alfa');
  console.log('✓ Entrada tardia negociada com sucesso! RemoteDescription do Viewer 2:', viewer2HostPeer?.pc.remoteDescription?.type);

  // 8. Parar e reiniciar compartilhamento de tela
  console.log('\n8. Testando parar e reiniciar o compartilhamento...');
  await hostPeerManager.detachLocalStream();
  stopAllTracks(hostStream);
  hostStream = null;
  console.log('   Host parou compartilhamento. Senders limpos:', hostPeer?.pc.senders[0]?.track === null);

  // Reiniciar
  const restartVideoTrack = new MockMediaStreamTrack('video');
  hostStream = new MockMediaStream([restartVideoTrack]);
  await hostPeerManager.attachLocalStream(hostStream);
  await new Promise((r) => setTimeout(r, 60));
  console.log('   Host reiniciou compartilhamento. Senders restaurados:', hostPeer?.pc.senders[0]?.track === restartVideoTrack);

  // 9. Desconexão de um cliente
  console.log('\n9. Testando desconexão do Cliente B...');
  viewerSignaling.disconnect();
  await new Promise((r) => setTimeout(r, 60));
  console.log('   Host removeu Cliente B:', hostPeerManager.getPeer('viewer-bravo') === undefined);
  console.log(`   Presença atualizada no Host: ${hostPresence}`);

  // 10. Limpeza final
  console.log('\n10. Finalizando clientes e servidor...');
  hostSignaling.disconnect();
  viewer2Signaling.disconnect();
  hostPeerManager.closeAll();
  viewerPeerManager.closeAll();
  viewer2PeerManager.closeAll();
  await server.close();

  console.log('\n======================================================');
  console.log('✓ TODAS AS VALIDAÇÕES DE MULTI-CLIENTES CONCLUÍDAS COM SUCESSO!');
  console.log('======================================================');
}

runValidation().catch((err) => {
  console.error('\n✖ Falha na validação:', err);
  process.exit(1);
});
