import { InteractionActions, InteractionLayer, useInteractionsUi } from '../features/room/components/RoomInteractions';
import { CapturePreview } from '../features/room/components/CapturePreview';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { Box, Alert } from '@mantine/core';
import { useRoomSession } from '../features/room/hooks/useRoomSession';
import { RoomHeader } from '../features/room/components/RoomHeader';
import { RoomStage } from '../features/room/components/RoomStage';
import { FloatingControlDock } from '../features/room/components/FloatingControlDock';
import { ParticipantsDrawer } from '../features/room/components/ParticipantsDrawer';
import { SettingsDrawer } from '../features/room/components/SettingsDrawer';
import { InviteQrModal } from '../features/room/components/InviteQrModal';
import { copyRoomInviteUrl } from '../features/room/utils/invite-url';

import { canShareScreen } from '../features/room/media/display-media';
import { getStoredShortcutsPreference, setStoredShortcutsPreference } from '../features/room/hooks/useRoomShortcuts';

export const Route = createFileRoute('/room/$roomId')({
  component: RoomPage,
});

function RoomPage() {
  const { roomId } = useParams({ from: '/room/$roomId' });
  const navigate = useNavigate();

  const isDev = Boolean(import.meta.env.DEV);
  const isDemo = Boolean(
    isDev &&
      typeof window !== 'undefined' &&
      ['single', 'multi'].includes(new URLSearchParams(window.location.search).get('demo') || '')
  );

  const [isCinema, setIsCinema] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string>('quality');
  const [shortcutsEnabled, setShortcutsEnabled] = useState<boolean>(getStoredShortcutsPreference);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrTriggerElement, setQrTriggerElement] = useState<HTMLElement | null>(null);

  const handleOpenQrCode = useCallback((triggerEl?: HTMLElement | null) => {
    setQrTriggerElement(triggerEl || (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null));
    setIsQrModalOpen(true);
  }, []);

  const handleToggleShortcuts = useCallback((enabled: boolean) => {
    setShortcutsEnabled(enabled);
    setStoredShortcutsPreference(enabled);
  }, []);

  const [canShare, setCanShare] = useState<boolean | null>(null);
  const [demoStreams, setDemoStreams] = useState<any[] | null>(null);
  const [demoParticipants, setDemoParticipants] = useState<any[] | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !isDev) return;
    const searchParams = new URLSearchParams(window.location.search);
    const drawer = searchParams.get('drawer');
    if (drawer === 'participants') {
      setIsParticipantsOpen(true);
    } else if (drawer === 'settings') {
      setIsSettingsOpen(true);
    }
    const tab = searchParams.get('tab');
    if (tab) {
      setSettingsTab(tab);
    }
  }, [isDev]);

  useEffect(() => {
    setCanShare(canShareScreen());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !isDev) return;
    const demo = new URLSearchParams(window.location.search).get('demo');
    if (demo === 'single' || demo === 'multi') {
      const c1 = document.createElement('canvas');
      c1.width = 1920;
      c1.height = 1080;
      const ctx1 = c1.getContext('2d')!;
      const draw1 = (t: number) => {
        ctx1.fillStyle = '#0b1120';
        ctx1.fillRect(0, 0, 1920, 1080);
        ctx1.fillStyle = '#38bdf8';
        ctx1.font = 'bold 52px system-ui, -apple-system, sans-serif';
        ctx1.fillText('Firminha — Apresentação de Arquitetura', 120, 180);
        ctx1.fillStyle = '#94a3b8';
        ctx1.font = '28px system-ui, -apple-system, sans-serif';
        ctx1.fillText('Screen Room • Nitidez · Equilibrado (até 1080p) • Áudio da aba ativo', 120, 240);

        // Simulated IDE code window
        ctx1.fillStyle = '#161b22';
        ctx1.roundRect(120, 290, 1680, 680, 16);
        ctx1.fill();
        ctx1.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx1.stroke();

        ctx1.fillStyle = '#58a6ff';
        ctx1.font = '28px monospace';
        ctx1.fillText('// WebRTC Direct P2P Screen Sharing', 160, 370);
        ctx1.fillStyle = '#e6edf3';
        ctx1.fillText('export async function connectScreenRoom(roomId: string) {', 160, 430);
        ctx1.fillStyle = '#7ee787';
        ctx1.fillText('  const peerManager = new PeerManager({ rtcConfig });', 160, 490);
        ctx1.fillStyle = '#79c0ff';
        ctx1.fillText('  const displayStream = await captureDisplayMedia(DEFAULT_QUALITY);', 160, 550);
        ctx1.fillStyle = '#ffa657';
        ctx1.fillText('  await peerManager.attachLocalStream(displayStream);', 160, 610);
        ctx1.fillStyle = '#e6edf3';
        ctx1.fillText('}', 160, 670);
      };
      draw1(0);
      const timer1 = setInterval(() => draw1(Date.now()), 200);

      const s1 = c1.captureStream(30);

      const streams = [{ peerId: 'peer_firminha', stream: s1 }];
      const parts = [
        { peerId: 'p_local', nickname: undefined, isLocal: true, isSharing: false },
        { peerId: 'peer_firminha', nickname: 'Firminha', isLocal: false, isSharing: true },
      ];

      let timer2: NodeJS.Timeout | null = null;
      if (demo === 'multi') {
        const c2 = document.createElement('canvas');
        c2.width = 1280;
        c2.height = 720;
        const ctx2 = c2.getContext('2d')!;

        const draw2 = () => {
          ctx2.fillStyle = '#1e1b4b';
          ctx2.fillRect(0, 0, 1280, 720);
          ctx2.fillStyle = '#c084fc';
          ctx2.font = 'bold 44px system-ui, -apple-system, sans-serif';
          ctx2.fillText('Ana — Protótipo Figma', 80, 180);
          ctx2.fillStyle = '#a5b4fc';
          ctx2.font = '24px system-ui, -apple-system, sans-serif';
          ctx2.fillText('Design System • 720p · 20 FPS', 80, 230);
        };
        draw2();
        timer2 = setInterval(draw2, 200);

        const s2 = c2.captureStream(30);

        streams.push({ peerId: 'peer_ana', stream: s2 });
        parts.push({ peerId: 'peer_ana', nickname: 'Ana', isLocal: false, isSharing: true });
        parts.push({ peerId: 'peer_lucas', nickname: 'Lucas', isLocal: false, isSharing: false });
        parts.push({ peerId: 'peer_mari', nickname: 'Mariana', isLocal: false, isSharing: false });
      }

      setDemoStreams(streams);
      setDemoParticipants(parts);

      return () => {
        clearInterval(timer1);
        if (timer2) clearInterval(timer2);
      };
    }
  }, []);

  const displayName =
    typeof window !== 'undefined'
      ? sessionStorage.getItem('screen_room_display_name') || undefined
      : undefined;

  const session = useRoomSession({
    roomId,
    displayName,
    enabled: !isDemo,
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const connected = session.connectionStatus === 'connected';
  const interactionsUi = useInteractionsUi({
    roomId,
    messages: session.chatMessages,
    error: session.interactionError,
    pending: session.chatPending,
    connected,
    onSendChat: session.sendChat,
    polls: session.polls,
    questions: session.questions,
    qaError: session.qaError,
    qaPending: session.qaPending,
    qaSubmitPending: session.qaSubmitPending,
    onSubmitQuestion: session.submitQuestion,
  });
  const { closePicker } = interactionsUi;
  useEffect(() => { closePicker(); }, [isCinema, isFullscreen, closePicker]);
  const localParticipant = session.participants.find((p) => p.isLocal);
  const localPeerId = localParticipant?.peerId;
  const isLocalPresenter = Boolean(localParticipant?.isSharing || session.isSharing);
  const [connectionAnnouncement, setConnectionAnnouncement] = useState<string>('');
  const interactionActions = (variant: 'header' | 'floating') => (
    <InteractionActions ui={interactionsUi} connected={connected} onSendReaction={session.sendReaction} variant={variant}
      handRaised={session.participants.some(p => p.isLocal && p.handOrder != null)} handReady={session.handReady} onToggleHand={session.toggleHand} />
  );
  const prevConnectionStatusRef = useRef(session.connectionStatus);

  useEffect(() => {
    const prev = prevConnectionStatusRef.current;
    const current = session.connectionStatus;
    prevConnectionStatusRef.current = current;

    if (prev === 'connected' && (current === 'disconnected' || current === 'error')) {
      setConnectionAnnouncement('Conexão perdida. Tentando reconectar…');
    } else if ((prev === 'disconnected' || prev === 'error') && current === 'connected') {
      setConnectionAnnouncement('Conexão restabelecida.');
    }
  }, [session.connectionStatus]);

  const handleOpenOrFocusInteractions = useCallback(() => {
    if (!interactionsUi.opened) {
      interactionsUi.openChat();
    } else {
      const panel = document.getElementById('room-chat-panel');
      if (panel) {
        const input = panel.querySelector<HTMLElement>(
          'textarea:not([disabled]), input:not([disabled]), [role="tab"][aria-selected="true"]'
        );
        input?.focus();
      }
    }
  }, [interactionsUi]);

  const handleLeave = () => {
    session.stopSharing();
    navigate({ to: '/' });
  };

  const handleCopyInvite = async () => {
    await copyRoomInviteUrl();
  };

  return (
    <Box
      style={{
        height: '100dvh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#080a0f',
        color: '#e6edf3',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Live status announcement for screen readers */}
      <Box
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {connectionAnnouncement}
      </Box>

      {/* Toast Notification */}
      {session.toastMessage && (
        <Box
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 68,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <Box
            style={{
              backgroundColor: '#161b22',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#e6edf3',
              padding: '8px 16px',
              borderRadius: '20px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.55)',
              fontSize: '0.82rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Box
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#3b82f6',
              }}
            />
            {session.toastMessage}
          </Box>
        </Box>
      )}

      {/* Error Alert Overlay */}
      {session.errorMessage && (
        <Box
          style={{
            position: 'fixed',
            top: 68,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            maxWidth: '90vw',
          }}
        >
          <Alert
            color="red"
            variant="filled"
            withCloseButton
            onClose={session.clearError}
            styles={{
              root: {
                backgroundColor: '#dc2626',
                color: '#fff',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              },
            }}
          >
            {session.errorMessage}
          </Alert>
        </Box>
      )}

      {/* Header */}
      {!isCinema && (
        <RoomHeader
          roomId={roomId}
          raisedHandCount={session.participants.filter(p => p.handOrder != null).length}
          participantCount={isDemo && demoParticipants ? demoParticipants.length : session.participantCount}
          connectionStatus={session.connectionStatus}
          onOpenParticipants={() => setIsParticipantsOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onLeave={handleLeave}
          interactions={isFullscreen ? null : interactionActions('header')}
          onOpenQrCode={handleOpenQrCode}
        />
      )}

      {/* Main Streaming Stage (Empty State or Spotlight + Previews) */}
      <RoomStage
        onVideoPresented={session.onVideoPresented}
        annotations={{ store: session.annotations, send: session.sendCollaboration, available: session.collaborationAvailable }}
        onTogglePointingPermission={session.togglePointingPermission}
        drawingEnabled={session.drawingEnabled}
        onToggleDrawingPermission={session.toggleDrawingPermission}
        onClearCollaborativeDrawings={session.clearCollaborativeDrawings}
        interactions={<InteractionLayer
          ui={interactionsUi}
          messages={session.chatMessages}
          reactions={session.reactions}
          error={session.interactionError}
          pending={session.chatPending}
          connected={connected}
          localPeerId={localPeerId}
          isPresenter={isLocalPresenter}
          questions={session.questions}
          highlightedQuestionId={session.highlightedQuestionId}
          polls={session.polls} pollsReady={session.pollsReady} pollError={session.pollError} pollPending={session.pollPending}
          onCreatePoll={session.createPoll} onVotePoll={session.votePoll} onClosePoll={session.closePoll}
          qaError={session.qaError}
          qaPending={session.qaPending}
          onWithdrawQuestion={session.withdrawQuestion}
          onAnswerQuestionText={session.answerQuestionText}
          onUpdateQuestionStatus={session.updateQuestionStatus}
        />}
        interactionAccess={interactionActions('floating')}
        onOpenOrFocusInteractions={handleOpenOrFocusInteractions}
        isCinema={isCinema}
        onToggleCinema={() => setIsCinema(value => !value)}
        remoteConnectionStates={session.remoteConnectionStates}
        onRetryPeer={session.retryPeer}
        localStream={session.localStream}
        isSharing={session.isSharing}
        remoteStreams={isDemo && demoStreams ? demoStreams : session.remoteStreams}
        featuredStreamId={
          isDemo && demoStreams
            ? session.featuredStreamId || demoStreams[0].peerId
            : session.featuredStreamId
        }
        onSelectFeaturedStream={session.selectFeaturedStream}
        participants={isDemo && demoParticipants ? demoParticipants : session.participants}
        onStartSharing={session.startSharing}
        onCopyInvite={handleCopyInvite}
        canShareScreen={canShare}
        shortcutsEnabled={shortcutsEnabled}
        onOpenQrCode={handleOpenQrCode}
      />

      {session.localStream && ['preview', 'publishing'].includes(session.captureState) && (
        <CapturePreview quality={session.quality} qualityPending={session.qualityPending} qualityNotice={session.qualityNotice}
          onChangeQuality={session.changeQuality} stream={session.localStream} pending={session.captureState === 'publishing'}
          onConfirm={session.publishCapture} onCancel={session.stopSharing} />
      )}

      {session.pendingStream && (
        <CapturePreview quality={session.quality} qualityPending={session.qualityPending} qualityNotice={session.qualityNotice}
          stream={session.pendingStream} replacing pending={session.captureState === 'switch-publishing'}
          onConfirm={session.confirmSwitch} onCancel={session.cancelSwitch} />
      )}

      {/* Floating Bottom Control Dock */}
      <FloatingControlDock
        onSwitchCapture={['sharing', 'paused'].includes(session.captureState) ? session.switchCapture : undefined}
        switchPending={session.captureState.startsWith('switch-')}
        switchRestoring={session.captureState === 'switch-restoring'}
        onCancelSwitch={session.cancelSwitch}
        capturePending={['requesting', 'preview', 'publishing', 'stopping'].includes(session.captureState)}
        isPaused={session.captureState === 'paused' || session.captureState.startsWith('switch-')}
        pausePending={['pausing', 'resuming'].includes(session.captureState)}
        onTogglePause={session.captureState === 'paused' ? session.publishCapture : session.pauseSharing}
        isSharing={session.isSharing}
        onToggleShare={session.captureState !== 'idle' ? session.stopSharing : session.startSharing}
        hasAudioTrack={session.hasAudioTrack}
        isAudioMuted={session.isAudioMuted}
        onToggleAudioMute={session.toggleAudioMute}
        onOpenParticipants={() => setIsParticipantsOpen(true)}
        raisedHandCount={session.participants.filter(p => p.handOrder != null).length}
        participantCount={isDemo && demoParticipants ? demoParticipants.length : session.participantCount}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLeave={handleLeave}
        canShareScreen={canShare}
        onOpenQrCode={handleOpenQrCode}
      />

      {/* Right Drawer: Participants */}
      <ParticipantsDrawer
        opened={isParticipantsOpen}
        onClose={() => setIsParticipantsOpen(false)}
        participants={isDemo && demoParticipants ? demoParticipants : session.participants}
        onUpdateNickname={session.updateNickname}
        currentNickname={session.currentNickname}
        followPresenterId={session.followPresenterId}
        followStatus={session.followStatus}
        onFollowPresenter={isDemo ? undefined : session.followPresenter}
        onResumeFollowing={session.resumeFollowing}
        onStopFollowing={session.stopFollowing}
      />

      {/* Right Drawer: Settings & Diagnostics */}
      <SettingsDrawer
        opened={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        quality={session.quality}
        onChangeQuality={session.changeQuality}
        networkStats={session.networkStats}
        connectionStatus={session.connectionStatus}
        diagnostics={session.diagnostics}
        hasAudioTrack={session.hasAudioTrack}
        isAudioMuted={session.isAudioMuted}
        onToggleAudioMute={session.toggleAudioMute}
        isSharing={session.isSharing}
        initialTab={settingsTab}
        shortcutsEnabled={shortcutsEnabled}
        onToggleShortcuts={handleToggleShortcuts}
      />

      {/* QR Code Invite Modal */}
      <InviteQrModal
        opened={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        roomId={roomId}
        triggerElement={qrTriggerElement}
      />
    </Box>
  );
}
