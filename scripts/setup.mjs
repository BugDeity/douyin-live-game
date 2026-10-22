// 首次安装：拉取 dyhub 采集服务（固定到验证过的版本）并安装依赖
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DYHUB_REPO = 'https://github.com/miyabi2202/dyhub.git';
const DYHUB_COMMIT = '11c4dcd';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dyhubDir = join(root, 'vendor', 'dyhub');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

if (!existsSync(dyhubDir)) {
  run(`git clone ${DYHUB_REPO} vendor/dyhub`);
}
run(`git checkout ${DYHUB_COMMIT}`, dyhubDir);
run('npm install --no-audit --no-fund', dyhubDir);
console.log('\n安装完成，运行 npm start 启动');
