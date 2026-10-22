// 一键启动：dyhub 采集服务（8757）+ 游戏页面（8760），都只监听本机
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_PORT = Number(process.env.GAME_PORT ?? 8760);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gameDir = join(root, 'game');
const dyhubDir = join(root, 'vendor', 'dyhub');
const noDyhub = process.argv.includes('--no-dyhub');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = normalize(join(gameDir, path === '/' ? 'index.html' : path));
  if (!file.startsWith(gameDir + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(GAME_PORT, '127.0.0.1', () => {
  console.log(`[game] 游戏页面: http://127.0.0.1:${GAME_PORT}/?roomId=直播间号`);
  console.log(`[game] 模拟弹幕: http://127.0.0.1:${GAME_PORT}/?mock`);
});

if (!noDyhub) {
  if (!existsSync(join(dyhubDir, 'node_modules'))) {
    console.error('[game] 未安装 dyhub，请先运行 npm run setup');
    process.exit(1);
  }
  const dyhub = spawn('npx tsx src/index.ts', {
    cwd: dyhubDir,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, DYHUB_HOST: '127.0.0.1' },
  });
  dyhub.on('exit', (code) => {
    console.error(`[game] dyhub 已退出（code ${code}）`);
    process.exit(code ?? 1);
  });
}
