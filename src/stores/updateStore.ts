/**
 * 在线更新的状态机（界面唯一的数据源）。
 *
 * 分两层：`lib/updateClient.ts` 负责「和插件 / 后端打交道」（能不能更新、检查、下载安装），
 * 这里负责「现在处于什么状态、该不该打扰用户、跳过过哪个版本」。
 * 判断本身（版本比较、要不要提示）在 `lib/update.ts`，那边有单测。
 *
 * **打扰用户的原则**：自动检查只在真的**有新版本且没被跳过**时留下痕迹（状态栏那一行），
 * 失败与「已是最新」都不出声；只有用户主动点开「版本与更新」才会看到检查结果与失败原因。
 */
import { create } from 'zustand'
import {
  checkForUpdate, getUpdateBlocker, installUpdate,
  type AvailableUpdate, type UpdateBlocker,
} from '../lib/updateClient'
import { shouldOfferUpdate } from '../lib/update'
import { useSettingsStore } from './settingsStore'

export type UpdateStatus =
  /** 还没检查过（或检查结果已被丢弃） */
  | 'idle'
  | 'checking'
  /** 已是最新 */
  | 'latest'
  /** 有新版本，且该提示用户 */
  | 'available'
  /** 有新版本，但用户点过「跳过此版本」——卡片里仍可重新安装 */
  | 'skipped'
  | 'downloading'
  /** 安装器已接手，本进程即将退出 */
  | 'installed'
  | 'error'

interface UpdateStoreState {
  status: UpdateStatus
  /** 不能自动更新的原因（探测结果）；`null` = 这台机器可以自动更新 */
  blocker: UpdateBlocker | null
  update: AvailableUpdate | null
  downloaded: number
  /** 安装包总大小；清单没给就是 `null`，界面据此画不确定态进度条 */
  total: number | null
  error: string | null
  /**
   * 失败发生在哪一步。**「检查更新失败」与「更新装不上」对用户是两件事**：
   * 前者是网络/清单的问题，后者是下载或签名的锅。混在一句话里会让人以为是自己的网断了，
   * 所以状态机把阶段记下来，卡片按阶段给话术与重试动作（见 UpdateCard 的错误分支）。
   */
  errorPhase: 'check' | 'install' | null

  /** 检查更新。`manual` = 用户主动点的：失败要把原因留在卡片上；自动检查失败要静默 */
  check: (manual: boolean) => Promise<void>
  /** 启动后自动检查一次（尊重设置里的开关，且只在环境允许时） */
  checkOnStartup: () => Promise<void>
  install: () => Promise<void>
  /** 跳过这个版本：记进设置，之后不再提示它（别的版本照常提示） */
  skip: () => void
}

const errorText = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e)
  return msg && msg !== 'undefined' ? msg : 'unknown error'
}

export const useUpdateStore = create<UpdateStoreState>()((set, get) => ({
  status: 'idle',
  blocker: null,
  update: null,
  downloaded: 0,
  total: null,
  error: null,
  errorPhase: null,

  check: async (manual) => {
    const { status } = get()
    // 正在下载/安装时不去打扰插件：`check()` 会先释放上一次的资源，
    // 把正在下载的那份丢掉
    if (status === 'checking' || status === 'downloading' || status === 'installed') return

    set({ status: 'checking', error: null, errorPhase: null })

    // 环境不允许（开发模式 / 非 Windows / MSI / 便携版）：不到网络上问，
    // 也不留任何提示。原因存下来，卡片里会说明白
    const blocker = await getUpdateBlocker()
    set({ blocker })
    if (blocker) {
      set({ status: 'idle', update: null })
      return
    }

    try {
      const found = await checkForUpdate()
      if (!found) {
        set({ status: 'latest', update: null })
        return
      }
      const skipped = useSettingsStore.getState().skippedUpdateVersion
      set({
        update: found,
        status: shouldOfferUpdate(found.version, found.currentVersion, skipped) ? 'available' : 'skipped',
      })
    } catch (e) {
      // 自动检查：网络断了、清单挂了都不该弹东西出来，静默回到 idle
      set({ status: manual ? 'error' : 'idle', error: errorText(e), errorPhase: 'check' })
    }
  },

  checkOnStartup: async () => {
    if (!useSettingsStore.getState().autoCheckUpdate) return
    // 用户可能在启动那几秒里已经打开「版本与更新」手动查过了（卡片挂载时会查一次）：
    // 那就别再问一遍网络
    if (get().status !== 'idle') return
    await get().check(false)
  },

  install: async () => {
    if (!get().update) return
    set({ status: 'downloading', downloaded: 0, total: null, error: null, errorPhase: null })
    try {
      await installUpdate((downloaded, total) => set({ downloaded, total }))
      set({ status: 'installed' })
    } catch (e) {
      // 走不到安装器就会落到这里：下载断了，或者签名对不上。阶段记成 install，
      // 卡片才会说「更新失败」而不是「检查更新失败」
      set({ status: 'error', error: errorText(e), errorPhase: 'install' })
    }
  },

  skip: () => {
    const version = get().update?.version
    if (version) useSettingsStore.getState().setField('skippedUpdateVersion', version)
    // 有意**不**释放插件的句柄：用户随时可能改主意点「立即更新」
    // （见 lib/updateClient.ts 的 installUpdate）。保留版本号也让卡片能说明「已跳过这个版本」。
    set({ status: 'skipped' })
  },
}))
