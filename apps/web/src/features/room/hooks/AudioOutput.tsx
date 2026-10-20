import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Button, NativeSelect, Stack, Text } from '@mantine/core';
import { AudioOutputRouter } from '../media/audio-output';

type OutputDevices = MediaDevices & { selectAudioOutput?: () => Promise<MediaDeviceInfo> };
const Context = createContext<ReturnType<typeof useOutput> | null>(null);
export const useAudioOutput = () => useContext(Context);
function useOutput() {
  const [, render] = useState(0);
  const alive = useRef(true);
  const [router] = useState(() => new AudioOutputRouter(() => { if (alive.current) render(value => value + 1); }));
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState('');
  const [choosing, setChoosing] = useState(false);
  const operation = useRef(0);
  const enumeration = useRef(0);
  const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices as OutputDevices | undefined;
  const policy = typeof document === 'undefined' ? undefined : (document as Document & { permissionsPolicy?: { allowsFeature: (name: string) => boolean }; featurePolicy?: { allowsFeature: (name: string) => boolean } });
  const blocked = (policy?.permissionsPolicy ?? policy?.featurePolicy)?.allowsFeature('speaker-selection') === false;
  const supported = typeof window !== 'undefined' && window.isSecureContext && typeof HTMLMediaElement.prototype.setSinkId === 'function' && !blocked;
  const refresh = async (check = false, restore = false) => {
    if (!media?.enumerateDevices) return;
    const generation = ++enumeration.current;
    const revision = operation.current;
    try {
      const outputs = (await media.enumerateDevices()).filter(item => item.kind === 'audiooutput' && item.deviceId && item.deviceId !== 'default');
      if (!alive.current || generation !== enumeration.current || revision !== operation.current) return;
      setDevices(outputs);
      if (check && router.desired) {
        if (!outputs.some(item => item.deviceId === router.desired)) router.suspend();
        else if (restore) router.select(router.desired);
      }
    } catch {
      if (!alive.current || generation !== enumeration.current || revision !== operation.current) return;
      setError('Não foi possível consultar as saídas autorizadas.');
      if (check && router.desired) router.suspend();
    }
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    const change = () => {
      // Silence immediately while checking: enumeration itself is asynchronous.
      const restore = !router.unavailable;
      if (router.desired) router.suspend();
      void refresh(true, restore);
    };
    media?.addEventListener('devicechange', change);
    return () => { alive.current = false; operation.current++; enumeration.current++; media?.removeEventListener('devicechange', change); };
  }, [media]);
  const select = (id: string) => { operation.current++; setChoosing(false); setError(''); router.select(id); };
  const choose = () => {
    if (!media?.selectAudioOutput) return;
    const generation = ++operation.current;
    setChoosing(true); setError('');
    // Invoke before any await to preserve the click's transient activation.
    let result: Promise<MediaDeviceInfo>;
    try { result = media.selectAudioOutput(); }
    catch { setChoosing(false); setError('Seleção indisponível ou bloqueada pelo navegador.'); return; }
    void result.then(device => {
      if (!alive.current || generation !== operation.current) return;
      if (device.deviceId && device.deviceId !== 'default') {
        setDevices(previous => [...previous.filter(item => item.deviceId !== device.deviceId), device]);
      }
      router.select(device.deviceId === 'default' ? '' : device.deviceId);
    }, () => {
      if (alive.current && generation === operation.current) setError('Seleção cancelada, negada ou indisponível. A escolha anterior foi mantida.');
    }).finally(() => { if (alive.current && generation === operation.current) setChoosing(false); });
  };
  return { router, devices, error, choosing, supported, blocked, native: !!media?.selectAudioOutput, select, choose };
}
export function AudioOutputProvider({ children }: { children: React.ReactNode }) {
  const output = useOutput();
  return <Context.Provider value={output}>{children}</Context.Provider>;
}
export function AudioOutputSettings() {
  const output = useAudioOutput();
  if (!output) return null;
  const { router } = output;
  return <Stack gap="xs">
    <Text fw={600} size="sm">Saída de áudio</Text>
    <Text size="xs" c="dimmed">Uma saída para todas as transmissões recebidas, somente nesta página.</Text>
    {output.supported ? <>
      <NativeSelect label="Dispositivo de saída" value={router.desired} onChange={event => output.select(event.currentTarget.value)} styles={{ input: { minHeight: 44 } }}>
        <option value="">Dispositivo padrão do sistema</option>
        {router.desired && !output.devices.some(item => item.deviceId === router.desired) && <option value={router.desired}>Saída selecionada</option>}
        {output.devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Saída autorizada ${index + 1}`}</option>)}
      </NativeSelect>
      {output.native && <Button variant="default" style={{ minHeight: 44 }} onClick={output.choose} disabled={output.choosing}>Escolher saída no navegador</Button>}
      <Text size="xs" c="dimmed">A lista contém apenas saídas expostas pelo navegador e pode não incluir todos os dispositivos.{!output.devices.length && ' Nenhuma alternativa exposta.'}</Text>
      <Text size="sm" role="status" aria-live="polite">{router.unavailable ? 'Saída indisponível ou falha ao aplicar. Áudio suspenso; escolha uma saída para retomar.' : output.choosing ? 'Aguardando escolha no navegador…' : router.pending ? 'Aplicando saída…' : 'Saída pronta para reprodução.'}</Text>
    </> : <Text size="sm">{output.blocked ? 'Seleção bloqueada pela política do navegador.' : 'Seleção programática indisponível neste navegador ou contexto.'} Use as configurações de áudio do sistema; a reprodução utiliza a saída padrão.</Text>}
    {output.error && <Text size="sm" role="alert">{output.error}</Text>}
  </Stack>;
}
