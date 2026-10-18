// 在线更新「界面侧纯逻辑」的单测（node --test 直跑，见 package.json）。
// 运行：node --experimental-transform-types --test tests/update.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeVersion, compareVersion, shouldOfferUpdate, progressRatio, formatBytes,
} from '../src/lib/update.ts'

// ---------- normalizeVersion ----------

test('normalizeVersion: 去掉前导 v 与首尾空白（清单允许写 v1.0.0）', () => {
  assert.equal(normalizeVersion('v0.3.5'), '0.3.5')
  assert.equal(normalizeVersion('V0.3.5'), '0.3.5')
  assert.equal(normalizeVersion('  0.3.5  '), '0.3.5')
  assert.equal(normalizeVersion('0.3.5'), '0.3.5')
})

test('normalizeVersion: 空值不炸（清单字段缺失时的兜底）', () => {
  assert.equal(normalizeVersion(''), '')
  assert.equal(normalizeVersion(undefined as unknown as string), '')
  assert.equal(normalizeVersion(null as unknown as string), '')
})

// ---------- compareVersion ----------

test('compareVersion: 主版本三段逐段比较', () => {
  assert.equal(compareVersion('0.3.4', '0.3.4'), 0)
  assert.equal(compareVersion('0.3.4', '0.3.5'), -1)
  assert.equal(compareVersion('0.3.5', '0.3.4'), 1)
  assert.equal(compareVersion('0.4.0', '0.3.9'), 1)
  assert.equal(compareVersion('1.0.0', '0.9.9'), 1)
})

test('compareVersion: 段数不足按 0 补齐（1.0 == 1.0.0）', () => {
  assert.equal(compareVersion('1.0', '1.0.0'), 0)
  assert.equal(compareVersion('1', '1.0.0'), 0)
  assert.equal(compareVersion('1.0', '1.0.1'), -1)
  // 补 0 之后不能把 1.1 误判成小于 1.0.9
  assert.equal(compareVersion('1.1', '1.0.9'), 1)
})

test('compareVersion: 前导 v 与 build metadata 不影响比较', () => {
  assert.equal(compareVersion('v0.3.5', '0.3.5'), 0)
  assert.equal(compareVersion('v0.3.5', 'v0.3.4'), 1)
  assert.equal(compareVersion('0.3.5+build7', '0.3.5'), 0)
})

test('compareVersion: 预发布标识按 semver 排序（正式版更大）', () => {
  assert.equal(compareVersion('1.0.0-beta', '1.0.0'), -1)
  assert.equal(compareVersion('1.0.0', '1.0.0-beta'), 1)
  assert.equal(compareVersion('1.0.0-alpha', '1.0.0-beta'), -1)
  assert.equal(compareVersion('1.0.0-alpha.1', '1.0.0-alpha.2'), -1)
  // 纯数字标识优先级低于字母标识
  assert.equal(compareVersion('1.0.0-1', '1.0.0-alpha'), -1)
  // 标识少的更小
  assert.equal(compareVersion('1.0.0-alpha', '1.0.0-alpha.1'), -1)
})

test('compareVersion: 无法解析时返回 0（宁可不提示，也不误弹）', () => {
  assert.equal(compareVersion('', '0.3.4'), 0)
  assert.equal(compareVersion('0.3.4', 'release-2026'), 0)
  assert.equal(compareVersion('next', '0.3.4'), 0)
  assert.equal(compareVersion('0.3.x', '0.3.4'), 0)
})

// ---------- shouldOfferUpdate ----------

test('shouldOfferUpdate: 只有严格更新的版本才提示', () => {
  assert.equal(shouldOfferUpdate('0.3.5', '0.3.4'), true)
  assert.equal(shouldOfferUpdate('v0.3.5', '0.3.4'), true)
  assert.equal(shouldOfferUpdate('0.3.4', '0.3.4'), false)
  assert.equal(shouldOfferUpdate('0.3.3', '0.3.4'), false) // 清单被传成旧版本
})

test('shouldOfferUpdate: 「跳过此版本」只跳过那一个版本', () => {
  assert.equal(shouldOfferUpdate('0.3.5', '0.3.4', '0.3.5'), false)
  assert.equal(shouldOfferUpdate('v0.3.5', '0.3.4', '0.3.5'), false) // 带不带 v 都认
  assert.equal(shouldOfferUpdate('0.3.6', '0.3.4', '0.3.5'), true)   // 更新的版本照常提示
  assert.equal(shouldOfferUpdate('0.3.5', '0.3.4', null), true)
  assert.equal(shouldOfferUpdate('0.3.5', '0.3.4', ''), true)
})

test('shouldOfferUpdate: 版本号缺失时不提示', () => {
  assert.equal(shouldOfferUpdate('', '0.3.4'), false)
  assert.equal(shouldOfferUpdate('0.3.5', ''), false)
})

// ---------- progressRatio ----------

test('progressRatio: 总大小未知返回 null（界面画不确定态，而不是假装 0%）', () => {
  assert.equal(progressRatio(1024, null), null)
  assert.equal(progressRatio(1024, undefined), null)
  assert.equal(progressRatio(1024, 0), null)
  assert.equal(progressRatio(Number.NaN, 100), null)
})

test('progressRatio: 正常区间与越界钳制', () => {
  assert.equal(progressRatio(0, 100), 0)
  assert.equal(progressRatio(50, 100), 0.5)
  assert.equal(progressRatio(100, 100), 1)
  assert.equal(progressRatio(150, 100), 1)  // 服务端多报字节也不超过 1
  assert.equal(progressRatio(-5, 100), 0)
})

// ---------- formatBytes ----------

test('formatBytes: 单位进位与一位小数', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(1024), '1 KB')
  assert.equal(formatBytes(1835008), '1.8 MB')
  assert.equal(formatBytes(1024 * 1024 * 1024), '1 GB')
})

test('formatBytes: 非法输入不产生 NaN 文案', () => {
  assert.equal(formatBytes(-1), '0 B')
  assert.equal(formatBytes(Number.NaN), '0 B')
  assert.equal(formatBytes(Number.POSITIVE_INFINITY), '0 B')
})
