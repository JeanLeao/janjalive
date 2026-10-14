import { z } from 'zod';

export const IceServerConfigSchema = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});

export type IceServerConfig = z.infer<typeof IceServerConfigSchema>;

export const TurnCredentialsResponseSchema = z.object({
  iceServers: z.array(IceServerConfigSchema),
});

export type TurnCredentialsResponse = z.infer<typeof TurnCredentialsResponseSchema>;
