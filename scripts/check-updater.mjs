#!/usr/bin/env node
/**
 * 发版前守卫：在线更新的关键配置写错，代价是**不可远程修复**的。
 *
 * 每一条都对应一个「发出去就晚了」的失败：
 *
 * 1. pubkey 缺失或格式错 —— 公钥被编进 exe，发出去就改不了。用户装到的是一个
 *    永远更新不了的版本，只能手动重装。所以这里不只查有没有，还把 base64 解开、
 *    按 minisign 公钥的结构验一遍。
 *    ⚠️ `tauri signer generate` 产出的 .pub 文件内容**本身就是 base64**（单行、无尾换行），
 *       直接原样填进配置即可，不要再编码一次 —— 双重编码解出来就不是 minisign 文本了。
 * 2. endpoints 还是占位地址 / 不是 https —— 用户永远检查不到更新。
 * 3. installMode 不是 passive —— 更新时会弹出安装向导，用户得自己点「下一步」。
 *
 * 故意**不**并进 `npm run build`：本地构建不需要真实 endpoint，天天红着的门禁
 * 只会被无视。它由 .github/workflows/release.yml 在发版时调用。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PLACEHOLDER = /REPLACE|PLACEHOLDER|CHANGEME|example\.com|YOUR[-_]/i;
const MINISIGN_COMMENT = 'untrusted comment: minisign public key';

const errors = [];
const notes = [];

let conf;
try {
  conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
} catch (e) {
  console.error(`✗ 读不了 src-tauri/tauri.conf.json：${e.message}`);
  process.exit(1);
}

const updater = conf?.plugins?.updater;
if (!updater) {
  errors.push('tauri.conf.json 里没有 plugins.updater —— 插件注册后 pubkey 是必需字段，缺了应用起不来');
}

// ── 1) pubkey ────────────────────────────────────────────────────────────────
const pubkey = updater?.pubkey ?? '';
if (!pubkey) {
  errors.push('plugins.updater.pubkey 缺失');
} else if (/[\\/]/.test(pubkey) || pubkey.endsWith('.pub')) {
  errors.push('pubkey 看起来是文件路径；Tauri 要的是公钥内容本身，不能是路径');
} else {
  const decoded = Buffer.from(pubkey, 'base64').toString('utf8');
  if (!decoded.startsWith(MINISIGN_COMMENT)) {
    errors.push(
      `pubkey 解 base64 后不是 minisign 公钥，得到：${JSON.stringify(decoded.slice(0, 40))}\n`
        + '    （.pub 文件内容本身就是 base64，原样填即可，不要再编码一次）',
    );
  } else {
    const lines = decoded.split('\n').filter((l) => l.length > 0);
    if (lines.length !== 2) {
      errors.push(`pubkey 解出 ${lines.length} 行，minisign 公钥应为 2 行`);
    } else if (lines[1].length !== 56) {
      errors.push(
        `minisign 公钥第二行长度 ${lines[1].length}，应为 56（2 字节算法 + 8 字节 key id + 32 字节密钥）`,
      );
    } else {
      notes.push(`pubkey 结构正常 —— ${lines[0]}`);
    }
  }
}

// ── 2) endpoints ─────────────────────────────────────────────────────────────
const endpoints = updater?.endpoints ?? [];
if (endpoints.length === 0) {
  errors.push('plugins.updater.endpoints 为空 —— 用户永远检查不到更新');
}
for (const url of endpoints) {
  if (PLACEHOLDER.test(url)) errors.push(`endpoints 还是占位地址：${url}`);
  if (!url.startsWith('https://')) errors.push(`endpoints 必须 https：${url}`);
}

// ── 3) Windows 安装模式 ──────────────────────────────────────────────────────
const mode = updater?.windows?.installMode;
if (mode !== 'passive') {
  errors.push(
    `plugins.updater.windows.installMode 是 ${JSON.stringify(mode)}，应为 "passive"`
      + '（进度条式静默安装，不需要用户点「下一步」）',
  );
}

for (const n of notes) console.log(`  · ${n}`);

if (errors.length > 0) {
  console.error('\n✗ 在线更新配置未就绪，不能发版：');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\n  改完重跑：node scripts/check-updater.mjs\n');
  process.exit(1);
}

console.log('✓ 在线更新配置就绪（pubkey / endpoints / installMode）');
