import { SignalingClient } from './signaling-client';
import { saveRoomSession } from './room-session-storage';

export function createRoom(): Promise<string> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, roomId?: string) => {
      clearTimeout(timer);
      client.disconnect();
      if (error) reject(error); else resolve(roomId!);
    };
    const client = new SignalingClient({
      autoReconnect: false,
      onStateChange: state => {
        if (state === 'connected') client.send({ type: 'create-room' });
        if (state === 'disconnected') finish(new Error('Conexão encerrada ao criar a sala. Tente novamente.'));
      },
      onMessage: message => {
        if (message.type === 'room-created') {
          try {
            saveRoomSession(message.roomId, { hostCredential: message.hostCredential });
            finish(undefined, message.roomId);
          } catch { finish(new Error('Permita o armazenamento de sessão neste navegador para criar uma sala.')); }
        } else if (message.type === 'error') finish(new Error(message.message));
      },
      onError: error => finish(error),
    });
    const timer = setTimeout(() => finish(new Error('Não foi possível criar a sala. Tente novamente.')), 10000);
    client.connect();
  });
}
