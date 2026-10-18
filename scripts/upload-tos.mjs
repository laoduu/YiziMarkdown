#!/usr/bin/env node
/**
 * 发版最后一步：把安装包（+ 签名）与更新清单传进火山引擎 TOS 桶。
 *
 * 为什么要有这个脚本：在线更新的分发端只有三样东西 —— 产物、`.sig`、`latest.json`，
 * 而它们的**上传顺序与缓存头是成败关键**：
 *
 *   1. 先传产物（名字里带版本号 ⇒ 内容永不变，`max-age=31536000, immutable` 让它走满缓存）；
 *   2. **最后**传 `latest.json` 且 `Cache-Control: no-cache`；
 *   3. 对象必须**公共读**（updater 匿名拉取，不带任何凭证）—— 这条错了的表现是
 *      「客户端永远查不到更新」，而本地怎么试都正常。所以传完立刻做一次匿名 HEAD 校验。
 * 顺序反了、或清单被 CDN 缓存住，客户端就会抱着旧清单一直说「已是最新」，且**无法远程修复**。
 *
 * 配置在 `.tos/config.json`（该目录已被 .gitignore 排除，含 AK/SK，绝不入库）。
 * 字段说明与骨架见文件内的 `_字段`；也可以用环境变量覆盖（便于以后接 CI）：
 *   TOS_BUCKET / TOS_REGION / TOS_ENDPOINT / TOS_PREFIX / TOS_PUBLIC_DOMAIN
 *   TOS_ACCESS_KEY_ID / TOS_ACCESS_KEY_SECRET / TOS_STS_TOKEN
 *
 * 用法：
 *   npm run tos:upload -- --version 0.3.5-beta.1 --notes <说明文件>      # 真传
 *   npm run tos:upload -- --version 0.3.5-beta.1 --dry-run              # 只校验+打印计划
 *   npm run tos:endpoint                                                  # 打印该写进 tauri.conf.json 的端点
 *
 * 产物与说明的默认位置（都能用 --artifact / --notes 覆盖）：
 *   src-tauri/target/release/bundle/nsis/YiziMarkdown_<version>_x64-setup.exe
 *   docs/changelog/CHANGELOG-V<version>.md
 *
 * 需要 --experimental-transform-types：清单由 src/lib/updateManifest.ts 组装（与
 * scripts/make-manifest.mjs、tests/updateManifest.test.ts 共用同一份实现，避免两处各写一份）。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { createHash, createPublicKey, verify as verifyEd25519 } from 'node:crypto'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TosClient } from '@volcengine/tos-sdk'
import { buildManifest } from '../src/lib/updateManifest.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable'
const CACHE_NO_CACHE = 'no-cache'
/** 同一份安装包挂在两个平台键上：`{os}-{arch}-{installer}` 与 `{os}-{arch}` 都命中（见 updateManifest.ts 顶部注释） */
const PLATFORM_KEYS = ['windows-x86_64-nsis', 'windows-x86_64']

const CONFIG_SKELETON = `{
  "bucket": "your-bucket",
  "region": "cn-beijing",
  "endpoint": "tos-cn-beijing.volces.com",
  "prefix": "updates",
  "publicDomain": "your-bucket.tos-cn-beijing.volces.com",
  "accessKeyId": "",
  "accessKeySecret": "",
  "stsToken": ""
}`

const USAGE = `
把安装包与更新清单传进 TOS 桶

  --version <ver>        版本号，默认取 src-tauri/tauri.conf.json
  --notes <file>         更新说明（Markdown），默认 docs/changelog/CHANGELOG-V<ver>.md
  --artifact <file>      安装包路径，默认 NSIS 产物（按版本号拼）
  --config <file>        桶配置，默认 .tos/config.json
  --dry-run              只校验文件与配置、打印上传计划，不发网络请求
  --force                允许覆盖已存在的同版本产物（默认拒绝，防手抖重发同一版）
  --skip-verify          跳过传完后的「匿名可读」校验（不建议）
  --print-endpoint       只打印该写进 tauri.conf.json 的端点 URL
  --help
`

/* ────────────────────────── 参数 ────────────────────────── */

const argv = process.argv.slice(2)
const opts = { dryRun: false, force: false, skipVerify: false, printEndpoint: false }

for (let i = 0; i < argv.length; i++) {
  const flag = argv[i]
  const next = () => {
    const value = argv[++i]
    if (value === undefined) fail(`参数 ${flag} 缺少取值`)
    return value
  }
  switch (flag) {
    case '--version': opts.version = next(); break
    case '--notes': opts.notes = next(); break
    case '--artifact': opts.artifact = next(); break
    case '--config': opts.config = next(); break
    case '--dry-run': opts.dryRun = true; break
    case '--force': opts.force = true; break
    case '--skip-verify': opts.skipVerify = true; break
    case '--print-endpoint': opts.printEndpoint = true; break
    case '--help': case '-h': console.log(USAGE); process.exit(0); break
    default: fail(`未知参数：${flag}`)
  }
}

function fail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

const say = (message = '') => console.log(message)

/* ────────────────────────── 配置 ────────────────────────── */

/**
 * 读桶配置。字段值与顺序都做过归一化：
 * - `endpoint` / `publicDomain` 允许被误填成带 `https://` 的形态，这里统一剥掉协议与尾斜杠；
 * - `prefix` 统一去掉首尾斜杠（空 = 放桶根）；
 * - 环境变量优先于文件，方便以后把 AK/SK 换成 CI secret。
 */
function loadConfig() {
  const configPath = resolve(root, opts.config ?? '.tos/config.json')
  if (!existsSync(configPath)) {
    fail(
      `找不到桶配置 ${relative(root, configPath)}。\n` +
        `  在本机建好这个文件（该目录已被 .gitignore 排除）：\n\n${CONFIG_SKELETON}`,
    )
  }

  let file
  try {
    file = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (e) {
    fail(`${relative(root, configPath)} 不是合法 JSON：${e.message}`)
  }

  const pick = (key, envName) => {
    const raw = process.env[envName] ?? file[key] ?? ''
    return String(raw).trim()
  }
  const stripScheme = (value) => value.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  const stripSlashes = (value) => value.replace(/^\/+|\/+$/g, '')

  const config = {
    bucket: pick('bucket', 'TOS_BUCKET'),
    region: pick('region', 'TOS_REGION'),
    endpoint: stripScheme(pick('endpoint', 'TOS_ENDPOINT')),
    prefix: stripSlashes(pick('prefix', 'TOS_PREFIX')),
    publicDomain: stripScheme(pick('publicDomain', 'TOS_PUBLIC_DOMAIN')),
    accessKeyId: pick('accessKeyId', 'TOS_ACCESS_KEY_ID'),
    accessKeySecret: pick('accessKeySecret', 'TOS_ACCESS_KEY_SECRET'),
    stsToken: pick('stsToken', 'TOS_STS_TOKEN'),
  }

  const missing = ['bucket', 'region', 'endpoint', 'publicDomain'].filter((k) => !config[k])
  if (missing.length) {
    fail(
      `${relative(root, configPath)} 还缺字段：${missing.join('、')}\n` +
        '  （publicDomain 是客户端下载用的域名，桶域名或 CDN 域名都行，不带 https:// 与路径）',
    )
  }
  if (!opts.printEndpoint) {
    const noKeys = ['accessKeyId', 'accessKeySecret'].filter((k) => !config[k])
    if (noKeys.length && !opts.dryRun) {
      fail(
        `${relative(root, configPath)} 还缺密钥：${noKeys.join('、')}\n` +
          '  建议用只对该桶有读写权限的子账号 AK/SK（别用主账号）。',
      )
    }
  }

  const base = config.prefix ? `${config.publicDomain}/${config.prefix}` : config.publicDomain
  return {
    ...config,
    endpointUrl: `https://${base}/latest.json`,
    publicBase: `https://${base}`,
    keyOf: (name) => (config.prefix ? `${config.prefix}/${name}` : name),
  }
}

/* ────────────────────────── 纯函数：申请化 ────────────────────────── */

const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function readVersion(config) {
  if (opts.version) return String(opts.version).replace(/^v/i, '').trim()
  try {
    return JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')).version
  } catch (e) {
    fail(`读不出 src-tauri/tauri.conf.json 的版本号：${e.message}`)
  }
}

/** 产物与说明的默认路径：与 tauri 的 NSIS 产物命名、docs/changelog 的命名约定一致 */
function resolveInputs(config, version) {
  if (!VERSION_RE.test(version)) {
    fail(`版本号 ${version} 不像 semver（示例 0.3.5 或 0.3.5-beta.1）—— 清单里写错版本号不会报错，只会让客户端看不到更新`)
  }

  const artifact = resolve(
    root,
    opts.artifact ?? `src-tauri/target/release/bundle/nsis/YiziMarkdown_${version}_x64-setup.exe`,
  )
  const notes = resolve(root, opts.notes ?? `docs/changelog/CHANGELOG-V${version}.md`)

  if (!existsSync(artifact)) {
    fail(
      `找不到安装包：${relative(root, artifact)}\n` +
        '  先构建（签名 + 打开 createUpdaterArtifacts）：\n' +
        '    $env:TAURI_SIGNING_PRIVATE_KEY="$env:USERPROFILE\\.tauri\\yizimarkdown.key"\n' +
        '    npm run tauri:build -- --bundles nsis --config src-tauri/tauri.updater.conf.json',
    )
  }
  if (!basename(artifact).includes(version)) {
    console.warn(`⚠ 产物文件名里没有版本号 ${version}：${basename(artifact)}（确认没拿错文件）`)
  }
  const sigPath = `${artifact}.sig`
  if (!existsSync(sigPath)) {
    fail(
      `找不到签名 ${relative(root, sigPath)}\n` +
        '  说明这次构建没开 bundle.createUpdaterArtifacts —— 记得带 --config src-tauri/tauri.updater.conf.json。',
    )
  }
  if (!existsSync(notes)) {
    fail(
      `找不到更新说明：${relative(root, notes)}\n` +
        '  用户是在「版本与更新」卡片里读这份 Markdown 的，别用开发者流水账；也可 --notes 指到别处。',
    )
  }
  if (config.endpointUrl === '') fail('端点拼装失败')

  return {
    artifact,
    artifactName: basename(artifact),
    sigPath,
    notesPath: notes,
    notesText: readFileSync(notes, 'utf8').replace(/\r\n/g, '\n').trimEnd(),
    artifactSize: statSync(artifact).size,
  }
}

/* ────────────────────────── 主流程 ────────────────────────── */

const sizeText = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`

const config = loadConfig()

if (opts.printEndpoint) {
  console.log(config.endpointUrl)
  process.exit(0)
}

const version = readVersion(config)
const input = resolveInputs(config, version)

// 清单：产物挂在两个平台键上，签名取 .sig 文件内容
const manifest = buildManifest({
  version,
  notes: input.notesText,
  artifacts: PLATFORM_KEYS.map((platform) => ({
    platform,
    url: `${config.publicBase}/${input.artifactName}`,
    signature: readFileSync(input.sigPath, 'utf8'),
  })),
})

const manifestPath = resolve(root, '.release_tmp/latest.json')
mkdirSync(dirname(manifestPath), { recursive: true })
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

say(`桶          ${config.bucket}  (${config.region} / ${config.endpoint})`)
say(`目录前缀    ${config.prefix || '（桶根）'}`)
say(`公网域名    ${config.publicDomain}`)
say(`版本        ${version}`)
say(`安装包      ${relative(root, input.artifact)}  (${sizeText(input.artifactSize)})`)
say(`更新说明    ${relative(root, input.notesPath)}  (${manifest.notes.split('\n').length} 行)`)
say(`清单        ${relative(root, manifestPath)}`)
say()
say('上传计划（顺序就是这个，别调）：')
say(`  1. ${config.keyOf(input.artifactName)}      cache: ${CACHE_IMMUTABLE}`)
say(`  2. ${config.keyOf('latest.json')}                     cache: ${CACHE_NO_CACHE}      ← 必须最后`)
say()
say(`写进 src-tauri/tauri.conf.json 的端点（应当与现值一致）：`)
say(`  ${config.endpointUrl}`)
say()

/* ── 签名自检：发出去就改不了的一环 ──────────────────────────────
 * 0.3.4 一旦发布，pubkey 就被编进 exe（改不了）。若它与实际签名私钥不是一对，
 * 用户装到的将是一个**永远更新不了**的版本 —— 只能手动重装。而 `tauri signer`
 * 只有 sign / generate、没有 verify，所以这里自己验一次。
 *
 * 格式（都是「文本文件的 base64」：外层解一次得文本，取第 2 行再解一次得二进制）：
 *   pubkey → alg(2) + keyId(8) + 公钥(32)
 *   .sig   → alg(2) + keyId(8) + 签名(64)
 * rsign 用的算法是 `ED`：对消息的 **BLAKE2b-512 预哈希**做 ed25519（`Ed` 才是直接签消息），
 * 两种都试，任一通过即通过。
 */
{
  const secondLine = (b64) =>
    Buffer.from(String(b64).trim(), 'base64')
      .toString('utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)[1]

  const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
  const pubkeyB64 = conf?.plugins?.updater?.pubkey
  if (!pubkeyB64) fail('src-tauri/tauri.conf.json 里没有 plugins.updater.pubkey')

  const pubRaw = Buffer.from(secondLine(pubkeyB64), 'base64')
  const sigRaw = Buffer.from(secondLine(readFileSync(input.sigPath, 'utf8')), 'base64')
  if (pubRaw.length < 42) fail(`配置里的 pubkey 解出来长度不对（${pubRaw.length} 字节）`)
  if (sigRaw.length < 74) fail(`签名解出来长度不对（${sigRaw.length} 字节）`)

  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pubRaw.subarray(10, 42)]),
    format: 'der',
    type: 'spki',
  })
  const data = readFileSync(input.artifact)
  const signature = sigRaw.subarray(10, 74)
  const signatureOk =
    verifyEd25519(null, data, publicKey, signature) ||
    verifyEd25519(null, createHash('blake2b512').update(data).digest(), publicKey, signature)

  if (!signatureOk) {
    fail(
      '安装包的签名无法用 tauri.conf.json 里烧进去的公钥验证 —— 这把公钥与签名私钥不是同一对。\n' +
        '  传上去客户端也会拒签，而且**发出去就无法远程修复**（公钥编在 exe 里）。先核对私钥，再重新构建。',
    )
  }
  say(`✓ 签名自检通过（配置里的 pubkey 能验证 ${basename(input.sigPath)}）`)
  say()
}

if (opts.dryRun) {
  say('--dry-run：以上为检查结果，未发任何网络请求。')
  process.exit(0)
}

const client = new TosClient({
  accessKeyId: config.accessKeyId,
  accessKeySecret: config.accessKeySecret,
  stsToken: config.stsToken || undefined,
  region: config.region,
  endpoint: config.endpoint,
})

/** 统一的错误翻译：TOS 的报错码要能直接对上「该去哪儿改」 */
async function run(label, action) {
  try {
    return await action()
  } catch (e) {
    const code = e?.code ?? e?.data?.Code ?? ''
    const status = e?.statusCode ?? ''
    const hint = {
      AccessDenied: '被桶策略/AK 权限拦住：确认这个 AK 对该桶有读写权限',
      InvalidAccessKeyId: 'AK 不对（配置文件的 accessKeyId）',
      SignatureDoesNotMatch: 'SK 不对（配置文件的 accessKeySecret）',
      NoSuchBucket: '桶名或地域不对（bucket / region / endpoint）',
      MalformedACL: '这个桶不允许对象级 ACL —— 需要在桶设置里关掉「阻止公共访问」，或改用桶策略放开读',
    }[code]
    console.error(`\n✗ ${label} 失败：${code || e?.message || e}${status ? ` (HTTP ${status})` : ''}`)
    if (hint) console.error(`  ${hint}`)
    const requestId = e?.requestId ?? e?.data?.RequestId
    if (requestId) console.error(`  requestId: ${requestId}（排查时提供给它）`)
    process.exit(1)
  }
}

say('开始上传…')
await run(`上传安装包 ${input.artifactName}`, () =>
  client.putObjectFromFile({
    bucket: config.bucket,
    key: config.keyOf(input.artifactName),
    filePath: input.artifact,
    contentType: 'application/octet-stream',
    cacheControl: CACHE_IMMUTABLE,
    acl: TosClient.ACLType.ACLPublicRead,
    // 同版本重复上传多半是发版手抖（0.3.5 已经发过一次），默认拒绝，--force 才覆盖
    forbidOverwrite: !opts.force,
    progress: (percent) => process.stdout.write(`\r  安装包 ${(percent * 100).toFixed(0)}%   `),
  }).then((res) => {
    process.stdout.write('\r')
    say(`  ✓ 安装包已上传（${sizeText(input.artifactSize)}）`)
    return res
  }),
)

say('上传更新清单（最后一步）…')
const manifestBody = readFileSync(manifestPath)
await run('上传 latest.json', () =>
  client
    .putObject({
      bucket: config.bucket,
      key: config.keyOf('latest.json'),
      body: manifestBody,
      contentType: 'application/json; charset=utf-8',
      cacheControl: CACHE_NO_CACHE,
      acl: TosClient.ACLType.ACLPublicRead,
    })
    .then(() => say('  ✓ latest.json 已上传')),
)

/* ── 匿名可读校验：这一条不过，客户端就永远「已是最新」且无法远程修复 ── */
if (!opts.skipVerify) {
  say()
  say('匿名可读校验（模拟客户端的拉取方式）…')
  const artifactUrl = `${config.publicBase}/${input.artifactName}`
  const manifestUrl = config.endpointUrl

  const artifactRes = await run(`HEAD ${artifactUrl}`, () => fetch(artifactUrl, { method: 'HEAD' }))
  if (!artifactRes.ok) {
    fail(`安装包不是公开可读的：HTTP ${artifactRes.status}。\n  需要在桶设置里允许对象公共读（脚本已给对象打 public-read ACL）。`)
  }
  const length = Number(artifactRes.headers.get('content-length') ?? '0')
  if (length && length !== input.artifactSize) {
    fail(`下载到的长度 ${length} 与本地文件 ${input.artifactSize} 不一致，上传可能被截断。`)
  }
  say(`  ✓ 安装包可匿名下载（HTTP ${artifactRes.status}，${sizeText(length || input.artifactSize)}）`)

  const manifestRes = await run(`GET ${manifestUrl}`, () => fetch(manifestUrl, { cache: 'no-store' }))
  if (!manifestRes.ok) {
    fail(`latest.json 拉不到：HTTP ${manifestRes.status}`)
  }
  const remote = await manifestRes.json().catch(() => null)
  if (!remote) fail('latest.json 不是合法 JSON —— 客户端会当成「没有更新」而静默失败')
  if (remote.version !== manifest.version) {
    fail(`清单里的版本是 ${remote.version}，本地生成的是 ${manifest.version}（多半是 CDN 缓存住旧清单）`)
  }
  const keys = Object.keys(remote.platforms ?? {})
  const missingKeys = PLATFORM_KEYS.filter((k) => !keys.includes(k))
  if (missingKeys.length) fail(`清单缺平台键：${missingKeys.join('、')}`)
  say(`  ✓ 清单可匿名拉取，version=${remote.version}，平台键 ${keys.join(' / ')}`)
}

say()
say('✓ 已入桶。')
say(`  端点 ${config.endpointUrl}`)
say('  提醒：0.3.4 这类**已发布**版本的 endpoints 是不可远程修改的 —— 换域名等于把老用户丢下。')
