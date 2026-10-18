/**
 * 「设置 → 其他产品」页签。
 *
 * 为什么单独一个文件：这个面板是纯数据 + 纯展示（没有状态、没有 IPC），而
 * SettingsModal.tsx 已经接近 1900 行；把它拆出来，改动面小、也好读。
 *
 * 图标来源：作者在 YiziVoice 仓库里维护的产品清单（`src/components/hub/AboutPanel.tsx`）
 * 与各产品自己的 public 图标，拷进 `src/assets/products/` 一起打包 —— 不引外链、
 * 不在运行时下载，离线也能显示。作者主页的头像则取自作者站点自己的 logo，同样下载后打包。
 *
 * 名字与官网属于品牌信息，不翻译；只有简介走 i18n（`settings.product*Desc`）。
 */
import { ArrowRight } from 'lucide-react'
import { invokeTauri } from '../lib/tauri'
import { useI18n } from '../i18n'
import iconVoice from '../assets/products/yizivoice.png'
import iconShare from '../assets/products/yizishare.png'
import iconStudio from '../assets/products/yizistudio.png'
import iconBiao from '../assets/products/yilukuangbiao.png'
import iconLishu from '../assets/products/lishu.png'
import iconAuthor from '../assets/products/1ziai.svg'

const PRODUCTS = [
  { name: 'YiziVoice', icon: iconVoice, url: 'https://voice.yizigpt.com', descKey: 'settings.productVoiceDesc' },
  { name: 'YiziShare', icon: iconShare, url: 'https://share.yizigpt.com', descKey: 'settings.productShareDesc' },
  { name: 'YiziStudio', icon: iconStudio, url: 'https://www.aidashi.vip/', descKey: 'settings.productStudioDesc' },
  { name: '一路狂标', icon: iconBiao, url: 'https://biao.yizigpt.com/', descKey: 'settings.productBiaoDesc' },
  { name: '荔书', icon: iconLishu, url: 'https://todo.yepaper.com', descKey: 'settings.productLishuDesc' },
] as const

/** 作者主页：不是产品，放列表末尾 */
const AUTHOR_HOME = 'https://www.1ziai.com/'

const openUrl = (url: string) => { invokeTauri('open_url', { url }) }

/** 卡片右侧显示域名：点之前就能看出会跳到哪个站 */
const domainOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

export function OtherProductsSettings() {
  const { t } = useI18n()
  return (
    <div className="settings-content-scroll">
      <div className="space-y-2 pt-1">
        {PRODUCTS.map((p) => (
          <button key={p.name} type="button" className="settings-product-card" onClick={() => openUrl(p.url)}>
            <img src={p.icon} alt={p.name} className="settings-product-icon" />
            <span className="settings-product-text">
              <span className="settings-product-name">{p.name}</span>
              <span className="settings-product-desc">{t(p.descKey)}</span>
            </span>
            <span className="settings-product-url">{domainOf(p.url)}</span>
            <ArrowRight size={14} className="settings-product-arrow" />
          </button>
        ))}

        <button type="button" className="settings-product-card" onClick={() => openUrl(AUTHOR_HOME)}>
          <img src={iconAuthor} alt={t('settings.authorHome')} className="settings-product-icon settings-product-icon-avatar" />
          <span className="settings-product-text">
            <span className="settings-product-name">{t('settings.authorHome')}</span>
          </span>
          <span className="settings-product-url">{domainOf(AUTHOR_HOME)}</span>
          <ArrowRight size={14} className="settings-product-arrow" />
        </button>
      </div>
    </div>
  )
}
