import React, { useId } from 'react';
import { Box, Button, Tooltip } from '@mantine/core';
import { IconCinema, IconMaximize, IconMinimize } from './Icons';
import './StageViewControls.css';

export function StageViewControls({ expanded, onExpandedChange, label, containerRef, children }: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  label: string;
  containerRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const toolsId = useId();
  const toggleLabel = expanded ? 'Recolher ferramentas' : 'Expandir ferramentas';
  return <Box ref={containerRef} className="stage-view-controls" role="group" aria-label={label}>
    <Tooltip label={toggleLabel} position="left" events={{ hover: true, focus: true, touch: false }} withArrow>
      <Button variant="subtle" color="gray" className="stage-controls-toggle" data-control-id="tools-toggle"
        aria-label={toggleLabel} aria-expanded={expanded} aria-controls={toolsId} onClick={() => onExpandedChange(!expanded)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={expanded ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
        </svg>
      </Button>
    </Tooltip>
    <Box id={toolsId} className="stage-controls-scroll" hidden={!expanded}>{expanded && children}</Box>
  </Box>;
}

export function CinemaControl({ active, onClick }: { active: boolean; onClick: () => void }) {
  const label = active ? 'Sair do Modo Cinema' : 'Modo Cinema';
  return <Tooltip position="left" label={label} events={{ hover: true, focus: true, touch: false }} withArrow>
    <Button variant={active ? 'filled' : 'subtle'} color={active ? 'blue' : 'gray'} data-control-id="cinema-toggle"
      aria-pressed={active} aria-label={label} onClick={onClick}><IconCinema size={15} aria-hidden /></Button>
  </Tooltip>;
}

export function FullscreenControl({ active, onClick }: { active: boolean; onClick: () => void }) {
  return <Tooltip position="left" label={active ? 'Sair da tela cheia (F)' : 'Tela cheia (F)'} events={{ hover: true, focus: true, touch: false }} withArrow>
    <Button variant={active ? 'filled' : 'subtle'} color={active ? 'blue' : 'gray'} data-control-id="fullscreen-toggle"
      aria-pressed={active} aria-label={active ? 'Sair da tela cheia' : 'Tela cheia'} onClick={onClick}>
      {active ? <IconMinimize size={15} aria-hidden /> : <IconMaximize size={15} aria-hidden />}
    </Button>
  </Tooltip>;
}
