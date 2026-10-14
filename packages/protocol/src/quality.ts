import { z } from 'zod';

export const QualityProfileKeySchema = z.enum(['economy', 'balanced', 'high']);
export type QualityProfileKey = z.infer<typeof QualityProfileKeySchema>;

export interface QualityProfile {
  label: string;
  maxBitrate: number;
  maxFramerate: number;
  width: number;
  height: number;
}

export const QUALITY_PROFILES: Record<QualityProfileKey, QualityProfile> = {
  economy: {
    label: 'Economia',
    maxBitrate: 800_000,
    maxFramerate: 15,
    width: 1280,
    height: 720,
  },
  balanced: {
    label: 'Equilibrado',
    maxBitrate: 1_500_000,
    maxFramerate: 20,
    width: 1280,
    height: 720,
  },
  high: {
    label: 'Alta qualidade',
    maxBitrate: 3_000_000,
    maxFramerate: 20,
    width: 1920,
    height: 1080,
  },
};
