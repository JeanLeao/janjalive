import { z } from 'zod';

export const QualityProfileKeySchema = z.enum(['economy', 'balanced', 'ultra']);
export type QualityProfileKey = z.infer<typeof QualityProfileKeySchema>;
export type VisualPriority = 'sharpness' | 'motion';
export type FrameRate = 20 | 30 | 60;
// Keep the native source capable of future live FPS increases. The selected
// ceiling is applied before preview/publication, via applyConstraints.
export const CAPTURE_FRAMERATE_ENVELOPE = 60;
export interface QualitySelection {
  priority: VisualPriority;
  profile: QualityProfileKey;
  fps: FrameRate;
}
export const DEFAULT_QUALITY: QualitySelection = { priority: 'sharpness', profile: 'balanced', fps: 20 };
export const QUALITY_PROFILES = {
  economy: { label: 'Econômico' },
  balanced: { label: 'Equilibrado' },
  ultra: { label: 'Ultra' },
} as const;
const MATRIX = {
  sharpness: {
    economy: { width: 1280, height: 720, maxBitrate: 1_600_000 },
    balanced: { width: 1920, height: 1080, maxBitrate: 3_000_000 },
    ultra: { width: 2560, height: 1440, maxBitrate: 6_000_000 },
  },
  motion: {
    economy: { width: 1280, height: 720, maxBitrate: 2_000_000 },
    balanced: { width: 1280, height: 720, maxBitrate: 4_000_000 },
    ultra: { width: 1920, height: 1080, maxBitrate: 8_000_000 },
  },
} as const;
export function validFrameRates(priority: VisualPriority, profile: QualityProfileKey): readonly FrameRate[] {
  return priority === 'sharpness' ? [20, 30] : profile === 'economy' ? [30] : [30, 60];
}
export function normalizeQuality(selection: QualitySelection): QualitySelection {
  const priority = selection.priority === 'motion' ? 'motion' : 'sharpness';
  const profile = QualityProfileKeySchema.safeParse(selection.profile).success ? selection.profile : 'balanced';
  const allowed = validFrameRates(priority, profile);
  const fps = allowed.includes(selection.fps) ? selection.fps : [...allowed].reverse().find(fps => fps <= selection.fps) ?? allowed[0];
  return { priority, profile, fps };
}
export function resolveQuality(selection: QualitySelection) {
  const normalized = normalizeQuality(selection);
  return {
    ...MATRIX[normalized.priority][normalized.profile],
    label: QUALITY_PROFILES[normalized.profile].label,
    maxFramerate: normalized.fps,
    contentHint: normalized.priority === 'sharpness' ? 'text' : 'motion',
    degradationPreference: normalized.priority === 'sharpness' ? 'maintain-resolution' as const : 'maintain-framerate' as const,
  };
}
export function downgradeQuality(selection: QualitySelection): QualitySelection {
  return normalizeQuality({ ...selection, profile: selection.profile === 'ultra' ? 'balanced' : 'economy' });
}
