import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  resolveClientIp,
  parseTrustedProxies,
  isIpTrusted,
  isIpInCidr,
  DEFAULT_TRUSTED_PROXIES,
} from '../dist/proxy.js';
import { createSignalServer } from '../dist/server.js';

function fakeRequest({ remoteAddress = '127.0.0.1', headers = {} }) {
  return {
    socket: { remoteAddress },
    headers,
  };
}

test('OPS-02: 1 - Conexão direta sem proxy utiliza o endereço TCP remoto', () => {
  const req = fakeRequest({ remoteAddress: '203.0.113.195', headers: {} });
  const ip = resolveClientIp(req, ['127.0.0.1']);
  assert.equal(ip, '203.0.113.195');
});

test('OPS-02: 2 - Proxy confiável extrai o IP real do cliente', () => {
  // Proxy local confiável na VPS (127.0.0.1)
  const req = fakeRequest({
    remoteAddress: '127.0.0.1',
    headers: { 'x-forwarded-for': '198.51.100.25' },
  });
  const ip = resolveClientIp(req, ['127.0.0.1']);
  assert.equal(ip, '198.51.100.25');

  // Proxy com contrato X-Real-IP
  const reqRealIp = fakeRequest({
    remoteAddress: '127.0.0.1',
    headers: { 'x-real-ip': '198.51.100.99' },
  });
  assert.equal(resolveClientIp(reqRealIp, ['127.0.0.1']), '198.51.100.99');
});

test('OPS-02: 3 - Proxy não confiável ignora solenemente X-Forwarded-For e X-Real-IP', () => {
  const untrustedReq = fakeRequest({
    remoteAddress: '198.51.100.40',
    headers: {
      'x-forwarded-for': '8.8.8.8',
      'x-real-ip': '1.1.1.1',
    },
  });
  // Servidor só confia em loopback
  const ip = resolveClientIp(untrustedReq, ['127.0.0.1']);
  assert.equal(ip, '198.51.100.40', 'Headers encaminhados de IPs não confiáveis DEVEM ser ignorados');
});

test('OPS-02: 4 - Cabeçalho de encaminhamento falsificado é neutralizado', () => {
  // Atacante (198.51.100.77) envia cabeçalho X-Forwarded-For forjado ('1.1.1.1') para o Caddy/Nginx (127.0.0.1).
  // O proxy reverso acrescenta o IP real da conexão do atacante ao final da cadeia: '1.1.1.1, 198.51.100.77'.
  const spoofedReq = fakeRequest({
    remoteAddress: '127.0.0.1',
    headers: {
      'x-forwarded-for': '1.1.1.1, 198.51.100.77',
    },
  });
  // A resolução right-to-left deve selecionar 198.51.100.77 e ignorar o spoofed 1.1.1.1
  const ip = resolveClientIp(spoofedReq, ['127.0.0.1']);
  assert.equal(ip, '198.51.100.77', 'O IP real deve ser o primeiro hop não confiável da direita para a esquerda');
});

test('OPS-02: 5 - Cadeia com múltiplos endereços e múltiplos proxies confiáveis', () => {
  // Cenário: Cliente (203.0.113.8) -> Load Balancer / CDN (10.0.0.2) -> Proxy Local (127.0.0.1) -> Node
  const multiHopReq = fakeRequest({
    remoteAddress: '127.0.0.1',
    headers: {
      'x-forwarded-for': '203.0.113.8, 10.0.0.2',
    },
  });
  const trustedProxies = ['127.0.0.1', '10.0.0.0/8'];
  const ip = resolveClientIp(multiHopReq, trustedProxies);
  assert.equal(ip, '203.0.113.8', 'Deve ignorar o hop intermediário confiável (10.0.0.2) e selecionar o cliente real');
});

test('OPS-02: 6 - Endereços IPv4 e IPv6 (incluindo ::ffff: e CIDR)', () => {
  // IPv6 nativo do cliente através de proxy IPv6 confiável
  const ipv6Req = fakeRequest({
    remoteAddress: '::1',
    headers: { 'x-forwarded-for': '2001:db8::cafe:1' },
  });
  assert.equal(resolveClientIp(ipv6Req, ['::1']), '2001:db8::cafe:1');

  // IPv4-mapped IPv6 normalization (::ffff:127.0.0.1)
  const mappedReq = fakeRequest({
    remoteAddress: '::ffff:127.0.0.1',
    headers: { 'x-forwarded-for': '203.0.113.44' },
  });
  assert.equal(resolveClientIp(mappedReq, ['127.0.0.1']), '203.0.113.44');

  // Validação de CIDR IPv4 e IPv6
  assert.equal(isIpInCidr('172.18.0.5', '172.18.0.0/16'), true);
  assert.equal(isIpInCidr('172.19.0.5', '172.18.0.0/16'), false);
  assert.equal(isIpInCidr('2001:db8::1', '2001:db8::/32'), true);
  assert.equal(isIpInCidr('2001:db9::1', '2001:db8::/32'), false);
});

test('OPS-02: 7 - Proxy executando na VPS (Caddy/Nginx local)', () => {
  const vpsReq = fakeRequest({
    remoteAddress: '127.0.0.1',
    headers: { 'x-forwarded-for': '187.60.12.34' },
  });
  const ip = resolveClientIp(vpsReq, parseTrustedProxies());
  assert.equal(ip, '187.60.12.34');
});

test('OPS-02: 8 - Proxy encaminhando para contêiner Docker (gateway de rede)', () => {
  // Em Docker bridge network, o proxy no host ou outro contêiner conecta via IP de gateway (ex: 172.17.0.1)
  const dockerReq = fakeRequest({
    remoteAddress: '172.17.0.1',
    headers: { 'x-forwarded-for': '189.40.88.12' },
  });
  // Sem TRUSTED_PROXIES configurado: não confia em 172.17.0.1
  assert.equal(resolveClientIp(dockerReq, parseTrustedProxies(undefined, [])), '172.17.0.1');

  // Com TRUSTED_PROXIES=172.17.0.1 ou 172.17.0.0/16
  const configured = parseTrustedProxies('127.0.0.1, 172.17.0.0/16');
  assert.equal(resolveClientIp(dockerReq, configured), '189.40.88.12');
});

test('OPS-02: 9 - Dez requisições simultâneas de participantes legítimos em /turn-credentials', async (t) => {
  // Inicia servidor com trustedProxies configurado para 127.0.0.1
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    trustedProxies: ['127.0.0.1'],
  });
  await app.ready;
  t.after(() => app.close());

  const serverPort = app.port;

  // 10 participantes distintos acessam o proxy reverso simultaneamente
  // Cada um possui seu respectivo IP público (203.0.113.1 até 203.0.113.10)
  const requests = Array.from({ length: 10 }, (_, i) => {
    const clientIp = `203.0.113.${i + 1}`;
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/turn-credentials',
          method: 'GET',
          headers: {
            'X-Forwarded-For': clientIp,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode, body }));
        }
      );
      req.on('error', reject);
      req.end();
    });
  });

  const responses = await Promise.all(requests);

  // Todas as 10 requisições simultâneas devem obter HTTP 200 com sucesso
  for (let i = 0; i < 10; i++) {
    const res = responses[i];
    assert.equal(res.statusCode, 200, `Participante ${i + 1} deve receber 200 OK sem ser bloqueado por rate limit`);
    const parsed = JSON.parse(res.body);
    assert.ok(Array.isArray(parsed.iceServers), 'Deve retornar lista válida de iceServers');
  }
});

test('OPS-02: 10 - Buckets independentes: cliente esgotado recebe HTTP 429 e outro IP continua com HTTP 200', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    trustedProxies: ['127.0.0.1'],
  });
  await app.ready;
  t.after(() => app.close());

  function makeRequest(ip) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: app.port,
          path: '/turn-credentials',
          method: 'GET',
          headers: { 'X-Forwarded-For': ip },
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ statusCode: res.statusCode, retryAfter: res.headers['retry-after'], body }));
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  const exhaustedIp = '198.51.100.77';
  const independentIp = '198.51.100.88';

  // 1. Cliente A realiza 60 requisições (limite máximo permitido na janela de 60s)
  for (let i = 0; i < 60; i++) {
    const res = await makeRequest(exhaustedIp);
    assert.equal(res.statusCode, 200, `Requisição ${i + 1} do cliente A deve ser 200`);
  }

  // 2. Requisição 61 do Cliente A atinge o limite e recebe HTTP 429 com Retry-After: 60
  const blockedRes = await makeRequest(exhaustedIp);
  assert.equal(blockedRes.statusCode, 429, 'Cliente A esgotado DEVE receber HTTP 429');
  assert.equal(blockedRes.retryAfter, '60', 'Deve informar Retry-After: 60');

  // 3. Cliente B, com IP distinto atrás do mesmo proxy, continua recebendo HTTP 200 normalmente
  const independentRes = await makeRequest(independentIp);
  assert.equal(independentRes.statusCode, 200, 'Cliente B com bucket independente DEVE receber HTTP 200');
  const parsed = JSON.parse(independentRes.body);
  assert.ok(Array.isArray(parsed.iceServers));
});

test('OPS-02: 11 - Tentativa de spoofing em conexão não confiável não contorna o rate limit', async (t) => {
  // Configuração onde loopback NÃO é confiável (simulando conexão direta ou proxy externo não autorizado)
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    trustedProxies: ['10.99.99.1'], // apenas proxy fictício é confiável
  });
  await app.ready;
  t.after(() => app.close());

  function makeDirectRequest(spoofedIp) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: app.port,
          path: '/turn-credentials',
          method: 'GET',
          headers: {
            'X-Forwarded-For': spoofedIp,
            'X-Real-IP': spoofedIp,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ statusCode: res.statusCode }));
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  // O atacante envia 60 requisições variando os cabeçalhos X-Forwarded-For e X-Real-IP
  for (let i = 0; i < 60; i++) {
    const res = await makeDirectRequest(`1.2.3.${i + 1}`);
    assert.equal(res.statusCode, 200);
  }

  // A 61ª requisição, mesmo com um IP forjado completamente novo, é bloqueada com 429
  // porque o servidor vincula a cota ao IP TCP real (127.0.0.1) e descarta os cabeçalhos não confiáveis
  const blocked = await makeDirectRequest('9.9.9.9');
  assert.equal(blocked.statusCode, 429, 'Spoofing em conexão não confiável DEVE ser neutralizado e bloqueado com 429');
});

test('OPS-02: 12 - Proxy reverso HTTP local em TCP comprovando encaminhamento de cabeçalhos', async (t) => {
  const signalApp = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    trustedProxies: ['127.0.0.1'],
  });
  await signalApp.ready;
  t.after(() => signalApp.close());

  // Cria um proxy reverso TCP HTTP local (emulando Caddy / Nginx na mesma VPS)
  const proxyServer = http.createServer((clientReq, clientRes) => {
    // Contrato do proxy reverso: define X-Real-IP com o endereço do cliente ou sobrescreve X-Forwarded-For
    const clientIp = clientReq.headers['x-simulated-client-ip'] || '203.0.113.77';
    const upstreamReq = http.request(
      {
        hostname: '127.0.0.1',
        port: signalApp.port,
        path: clientReq.url,
        method: clientReq.method,
        headers: {
          ...clientReq.headers,
          'x-real-ip': clientIp,
          'x-forwarded-for': clientIp,
        },
      },
      (upstreamRes) => {
        clientRes.writeHead(upstreamRes.statusCode, upstreamRes.headers);
        upstreamRes.pipe(clientRes);
      }
    );
    clientReq.pipe(upstreamReq);
  });

  await new Promise((resolve) => proxyServer.listen(0, '127.0.0.1', resolve));
  const proxyPort = proxyServer.address().port;
  t.after(() => new Promise((resolve) => proxyServer.close(resolve)));

  // Cliente acessa a aplicação via proxy reverso
  const clientRes = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: proxyPort,
        path: '/turn-credentials',
        method: 'GET',
        headers: {
          'x-simulated-client-ip': '198.51.100.123',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });

  assert.equal(clientRes.statusCode, 200, 'Requisição via proxy reverso TCP real deve ser 200 OK');
  const parsed = JSON.parse(clientRes.body);
  assert.ok(Array.isArray(parsed.iceServers));
});

test('OPS-02: 13 - Múltiplos participantes (10) atrás do mesmo IP compartilhado (NAT) operam confortavelmente dentro da cota', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    trustedProxies: ['127.0.0.1'],
  });
  await app.ready;
  t.after(() => app.close());

  const sharedNatIp = '203.0.113.50';

  // 10 participantes realizam 2 requisições cada (por exemplo na entrada e na renegociação de TURN)
  // Total = 20 requisições, perfeitamente dentro da cota padrão de 60 req/min
  for (let participant = 1; participant <= 10; participant++) {
    for (let reqNum = 1; reqNum <= 2; reqNum++) {
      const res = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: app.port,
            path: '/turn-credentials',
            method: 'GET',
            headers: { 'X-Forwarded-For': sharedNatIp },
          },
          (r) => {
            r.on('data', () => {});
            r.on('end', () => resolve({ statusCode: r.statusCode }));
          }
        );
        req.on('error', reject);
        req.end();
      });
      assert.equal(res.statusCode, 200, `Participante ${participant} req ${reqNum} sob NAT compartilhado deve ter sucesso`);
    }
  }
});
