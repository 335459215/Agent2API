import { apiCall } from './client'
import { githubErrorMessage } from '../../../ui-shared/updates'
import { t } from '../i18n'
import type {
  PluginMutation, PluginOperation, PluginSettings, PluginsPayload, PluginUpdate, ReleaseState,
} from '../../../ui-shared/plugins'

export type {
  PackProvider, PackSummary, PluginMutation, PluginOperation, PluginSettings,
  PluginsPayload, PluginUpdate, StorePlugin,
} from '../../../ui-shared/plugins'

export function pluginErrorMessage(error: unknown): string {
  return githubErrorMessage(error, t, 'plugin')
}

/**
 * 剔掉已经不再成立的操作记录。
 *
 * ── 为什么在数据层删，而不是在界面里换个颜色 ────────────────
 * `operations` 来自 kv 的 `pluginOperation:<id>`，是**历史**记录，后端没有
 * 清除接口（要加得改 Rust 并重编 liba2a_server.so，APK 里是预编译产物）。
 *
 * 失败记录的典型来源：APK 形态下面板内升级插件 —— 二进制只有经
 * `nativeLibraryDir` 的软链才可执行，复制到 app 私有目录再 exec 会被
 * noexec 拒，于是写下一条 `Permission denied`，同时**已恢复原插件状态**。
 * 也就是说插件一直在正常跑，页面上却挂着一句「启动失败」。
 *
 * ── 判据：看它现在有没有问题，不看版本号 ───────────────────
 * 版本号不可靠：回滚后版本没变，记录就删不掉。真正该问的是「这个插件此刻
 * 是否健康」—— 在跑、没 lastError、没崩、文件齐、没被停用。健康就说明
 * 那条失败不成立，直接删；不健康才把错误留在界面上。
 *
 * 有故障就要报，没故障就不要出现任何关于失败的陈述。
 */
export function dropStaleOperations(payload: PluginsPayload): PluginsPayload {
  const packs = new Map((payload.packs || []).map(pack => [pack.id, pack]))
  const operations = (payload.operations || []).filter(operation => {
    if (operation.active) return true // 正在跑的任务永远展示
    const failed = Boolean(operation.error || operation.hostError)
    if (!failed) return true // 成功记录交给 toast 处理

    const pack = packs.get(operation.id)
    if (!pack) return true // 找不到对应插件，不猜、不乱删

    /** 这个插件此刻是坏的？任一信号成立就算坏，错误要留着让人看见。 */
    const broken = Boolean(pack.host?.lastError)
      || (pack.host?.crashes ?? 0) > 0
      || pack.entryPresent === false
      || (pack.enabled === true && pack.host?.running === false)
    return broken
  })
  return { ...payload, operations }
}

export async function getPlugins(signal?: AbortSignal): Promise<PluginsPayload> {
  return dropStaleOperations(await apiCall<PluginsPayload>('/api/plugins', { signal }))
}

export function refreshPluginCatalog(): Promise<ReleaseState> {
  return apiCall('/api/plugins/release')
}

export function checkPluginUpdates(): Promise<{ error?: boolean; reason?: string; updates?: PluginUpdate[] }> {
  return apiCall('/api/plugins/update')
}

export function startPluginInstall(id: string, target: string, update = false): Promise<{ operation: PluginOperation }> {
  return apiCall(update ? '/api/plugins/update' : '/api/plugins/install-from-release', {
    method: 'POST',
    body: { id, target },
  })
}

export function setPluginEnabled(id: string, enabled: boolean): Promise<PluginMutation> {
  return apiCall('/api/plugins/enable', { method: 'POST', body: { id, enabled } })
}

export function setPluginProvider(id: string, provider: string, enabled: boolean): Promise<PluginMutation> {
  return apiCall('/api/plugins/provider', { method: 'POST', body: { id, provider, enabled } })
}

export function uninstallPlugin(id: string): Promise<PluginMutation> {
  return apiCall('/api/plugins/uninstall', { method: 'POST', body: { id } })
}

export function getPluginSettings(signal?: AbortSignal): Promise<PluginSettings> {
  return apiCall('/api/plugins/settings', { signal })
}

export function savePluginSettings(body: Partial<PluginSettings>): Promise<PluginSettings> {
  return apiCall('/api/plugins/settings', { method: 'PATCH', body })
}
