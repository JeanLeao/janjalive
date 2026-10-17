import React from 'react';
import { Box, Button, Text } from '@mantine/core';
import type { FollowStatus } from '../hooks/follow-presenter';

export interface FollowControlsProps {
  status: FollowStatus;
  /** Display name of the presenter chosen by this viewer. */
  followedName?: string;
  /** Remote presenter currently on stage, offered as a follow target when not already followed. */
  viewedPresenter?: { id: string; name: string };
  /** The local participant is sharing and may point followers at the stage shown here. */
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
};
const STATUS_COLOR: Record<Exclude<FollowStatus, 'off'>, string> = {
  active: '#22c55e', suspended: '#eab308', away: '#8c959f',
};

export function followControlsVisible(p: Pick<FollowControlsProps, 'status' | 'viewedPresenter' | 'canIndicate'>): boolean {
  return p.status !== 'off' || Boolean(p.viewedPresenter) || p.canIndicate;
}

/** F29: follow-mode status and actions, kept compact so the stage stays uncluttered. */
export const FollowControls = React.forwardRef<HTMLDivElement, FollowControlsProps>(function FollowControls(props, ref) {
  const { status, followedName, viewedPresenter, canIndicate, onFollow, onResume, onStop, onIndicate } = props;
  const canOfferFollow = viewedPresenter && (status === 'off' || status === 'suspended');
  return (
    <Box ref={ref} className="follow-controls" role="group" aria-label="Seguir apresentador">
      {status !== 'off' && (
        <Box className="follow-chip" role="status" aria-live="polite" data-follow-status={status}>
          <Box className="follow-dot" style={{ backgroundColor: STATUS_COLOR[status] }} aria-hidden />
          <Text size="xs" fw={600} c="#fff" className="follow-chip-text">
            Seguindo {followedName || 'apresentador'} · {STATUS_LABEL[status]}
          </Text>
        </Box>
      )}
      {status === 'suspended' && (
        <Button size="xs" variant="filled" color="blue" onClick={onResume}>Retomar</Button>
      )}
      {canOfferFollow && (
        <Button size="xs" variant="default" onClick={() => onFollow(viewedPresenter.id)}>
          Seguir {viewedPresenter.name}
        </Button>
      )}
      {status !== 'off' && (
        <Button size="xs" variant="default" onClick={onStop}>Parar de seguir</Button>
      )}
      {canIndicate && (
        <Button size="xs" variant="light" color="blue" onClick={onIndicate}>Indicar aos seguidores</Button>
      )}
    </Box>
  );
});
