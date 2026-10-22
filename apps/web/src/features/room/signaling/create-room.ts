import { SignalingClient } from './signaling-client';
import { saveRoomSession } from './room-session-storage';

export interface CreateRoomOptions {
  isProtected?: boolean;
}

export interface CreateRoomResult {
  roomId: string;
  roomKey?: string;
}

export function createRoom(options?: CreateRoomOptions): Promise<CreateRoomResult> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, result?: CreateRoomResult) => {
      clearTimeout(timer);
      client.disconnect();
      if (error) reject(error); else resolve(result!);
    };
    const client = new SignalingClient({
      autoReconnect: false,
      onStateChange: state => {
        if (state === 'connected') client.send({ type: 'create-room', ...(options?.isProtected ? { isProtected: true } : {}) });
        if (state === 'disconnected') finish(new Error('Conexão encerrada ao criar a sala. Tente novamente.'));
      },
      onMessage: message => {
        if (message.type === 'room-created') {
          try {
            saveRoomSession(message.roomId, {
              hostCredential: message.hostCredential,
              ...(message.roomKey ? { roomKey: message.roomKey } : {}),
            });
            finish(undefined, { roomId: message.roomId, roomKey: message.roomKey });
          } catch { finish(new Error('Permita o armazenamento de sessão neste navegador para criar uma sala.')); }
        } else if (message.type === 'error') finish(new Error(message.message));
      },
      onError: error => finish(error),
    });
    const timer = setTimeout(() => finish(new Error('Não foi possível criar a sala. Tente novamente.')), 10000);
    client.connect();
  });
}
