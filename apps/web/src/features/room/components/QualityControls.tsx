import { NativeSelect, SegmentedControl, SimpleGrid, Stack, Text } from '@mantine/core';
import {
  QUALITY_PROFILES, normalizeQuality, resolveQuality, validFrameRates,
  type QualitySelection, type VisualPriority, type QualityProfileKey, type FrameRate,
} from '@screen-room/protocol';

export function QualityControls({ quality, onChange, disabled = false, compact = false }: {
  quality: QualitySelection; onChange?: (quality: QualitySelection) => void; disabled?: boolean; compact?: boolean;
}) {
  const profile = resolveQuality(quality);
  const update = (patch: Partial<QualitySelection>) => onChange?.(normalizeQuality({ ...quality, ...patch }));
  const styles = { input: { minHeight: 44, background: '#161b22', color: '#e6edf3' } };
  return <Stack gap="xs">
    {onChange && <>
      <div>
        <Text size="sm" fw={500}>Prioridade visual</Text>
        <SegmentedControl fullWidth value={quality.priority} disabled={disabled} aria-label="Prioridade visual"
          onChange={value => update({ priority: value as VisualPriority })}
          data={[{ value: 'sharpness', label: 'Nitidez' }, { value: 'motion', label: 'Fluidez' }]}
          styles={{ root: { background: '#161b22' }, label: { minHeight: 40, display: 'grid', placeItems: 'center' } }} />
      </div>
      {!compact && <Text size="xs" c="#9da7b3">
        {quality.priority === 'sharpness' ? 'Prioriza a leitura de textos, códigos e documentos.' : 'Prioriza movimento, animações e navegação dinâmica.'}
      </Text>}
      <SimpleGrid cols={compact ? 2 : 1} spacing="xs" style={{ alignItems: 'end' }}>
        <NativeSelect label="Nível de qualidade" value={quality.profile} disabled={disabled}
          onChange={event => update({ profile: event.currentTarget.value as QualityProfileKey })}
          data={Object.entries(QUALITY_PROFILES).map(([value, item]) => ({ value, label: item.label }))} styles={styles} />
        <NativeSelect label="Limite de FPS" value={quality.fps} disabled={disabled}
          onChange={event => update({ fps: Number(event.currentTarget.value) as FrameRate })}
          data={validFrameRates(quality.priority, quality.profile).map(fps => ({ value: String(fps), label: `${fps} FPS` }))} styles={styles} />
      </SimpleGrid>
    </>}
    <div>
      <Text size="sm" c="#e6edf3">{quality.priority === 'sharpness' ? 'Nitidez' : 'Fluidez'} · {profile.label} · {quality.fps} FPS</Text>
      <Text size="xs" c="#9da7b3">Resolução desejada: {profile.width} × {profile.height} ({profile.height}p)</Text>
      <Text size="xs" c="#9da7b3">Teto de {quality.fps} FPS e {profile.maxBitrate / 1_000_000} Mbps. A fonte, o navegador e a rede podem limitar a qualidade.</Text>
    </div>
  </Stack>;
}
