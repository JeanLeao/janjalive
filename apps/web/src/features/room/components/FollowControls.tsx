import React from 'react';
import { Box, Button, Menu, Text } from '@mantine/core';
import type { FollowStatus } from '../hooks/follow-presenter';

export interface FollowControlsProps {
  status: FollowStatus;
  followedName?: string;
  presenters: { id: string; name: string }[];
  canIndicate: boolean;
  onFollow: (presenterId: string) => void;
  onResume: () => void;
  onStop: () => void;
  onIndicate: () => void;
}

const STATUS_LABEL: Record<Exclude<FollowStatus, 'off'>, string> = {
  active: 'Acompanhando',
  suspended: 'Suspenso',
  away: 'Aguardando reconexão',
  unavailable: 'Transmissão indisponível',
};
const STATUS_COLOR: Record<Exclude<FollowStatus, 'off'>, string> = {
  active: '#22c55e', suspended: '#eab308', away: '#8c959f', unavailable: '#8c959f',
};

export function followControlsVisible(p: Pick<FollowControlsProps, 'status' | 'presenters' | 'canIndicate'>): boolean {
  return p.status !== 'off' || p.presenters.length > 0 || p.canIndicate;
}

/** One persistent status/control; secondary actions stay in the stage's contextual menu. */
export const FollowControls = React.forwardRef<HTMLDivElement, FollowControlsProps>(function FollowControls(props, ref) {
  const { status, followedName, presenters, canIndicate, onFollow, onResume, onStop, onIndicate } = props;
  return (
    <Box ref={ref} className="follow-controls" role="group" aria-label="Seguir apresentador">
      <Menu withinPortal={false} position="bottom-start" width={272} offset={6}>
        <Menu.Target>
          <Button variant="default" size="xs" className="follow-trigger" aria-label="Acompanhamento"
            rightSection={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>}>
            {status === 'off' ? 'Acompanhamento' : (
              <Box component="span" className="follow-chip" role="status" aria-live="polite" data-follow-status={status}>
                <Box component="span" className="follow-dot" style={{ backgroundColor: STATUS_COLOR[status] }} aria-hidden />
                <Box component="span" className="follow-chip-text">
                  <Text component="span" size="xs" fw={600} c="#fff">Seguindo {followedName || 'apresentador'}</Text>
                  <Text component="span" size="xs" c="#c9d1d9">{STATUS_LABEL[status]}</Text>
                </Box>
              </Box>
            )}
          </Button>
        </Menu.Target>
        <Menu.Dropdown className="follow-menu">
          {status === 'suspended' && <Menu.Item onClick={onResume}>Retomar</Menu.Item>}
          {presenters.length > 0 && <Menu.Label>{status === 'off' ? 'Seguir apresentador' : 'Trocar de apresentador'}</Menu.Label>}
          {presenters.map(presenter => <Menu.Item key={presenter.id} onClick={() => onFollow(presenter.id)}>Seguir {presenter.name}</Menu.Item>)}
          {status !== 'off' && <Menu.Item onClick={onStop}>Parar de seguir</Menu.Item>}
          {canIndicate && <>
            {(status !== 'off' || presenters.length > 0) && <Menu.Divider />}
            <Menu.Item onClick={onIndicate}>Indicar aos seguidores</Menu.Item>
          </>}
        </Menu.Dropdown>
      </Menu>
      <style>{`
        .follow-controls .follow-trigger { height: auto; min-height: var(--stage-control-size, 36px); max-width: 100%; padding: 6px 10px; background: #0d1117; border-color: #30363d; }
        .follow-controls .follow-trigger .mantine-Button-label { white-space: normal; text-align: left; }
        .follow-controls .follow-chip { display: flex; align-items: center; gap: 8px; padding: 0; min-height: 0; border: 0; background: none; border-radius: 0; backdrop-filter: none; }
        .follow-controls .follow-chip-text { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
        .follow-controls .follow-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
        .follow-menu { max-width: calc(100vw - 32px); max-height: 50dvh; overflow-y: auto; background: #161b22; border-color: #30363d; }
        .follow-menu [role="menuitem"] { min-height: 44px; white-space: normal; overflow-wrap: anywhere; color: #f0f6fc; }
        .follow-menu :focus-visible { outline: 2px solid #58a6ff; outline-offset: -2px; }
      `}</style>
    </Box>
  );
});
