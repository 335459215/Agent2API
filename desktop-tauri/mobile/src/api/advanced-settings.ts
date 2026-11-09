/**
 * 网关高级设置（手机端补齐桌面端才有的配置项）。
 *
 * ── 为什么单独一个模块 ──────────────────────────────────────
 * 手机端原本把「端口、路由、重试、超时、数据保留」这类**需要读文档
 * 才能填对**的项一律藏在桌面端。这个假设是错的：用手机管一台常驻
 * 网关的人，恰恰最需要就地改超时、改重试、改保留天数。
 *
 * 这些端点全部是统一的 GET/PUT 键值对，手机和桌面走的是完全相同的
 * HTTP 接口 —— 缺的只是界面，不是权限。
 *
 * 字段名逐字对齐 `server/config/types.rs` 的 `KEY_*` 常量，
 * 那些常量是前后端之间的**契约**，不能改写成自造的驼峰名。
 */
import { apiCall } from './client'

// ── 请求超时（秒，1–3600）────────────────────────────────────
export type Timeouts = {
  connectTimeoutSeconds: number
  headersTimeoutSeconds: number
  streamIdleTimeoutSeconds: number
  bodyTimeoutSeconds: number
}

export const getTimeouts = () => apiCall<Timeouts>('/api/timeouts')
export const saveTimeouts = (patch: Partial<Timeouts>) =>
  apiCall<Timeouts>('/api/timeouts', { method: 'PUT', body: patch })

// ── 请求重试 ─────────────────────────────────────────────────
// retryCount            同一账号内重试总次数
// retryCrossProviderCount 重试仍失败后换账号的次数
// retryIntervalSeconds  两次重试之间的间隔
// noRetryStatusCodes    命中即直接换号的 HTTP 状态码（100–599，最多 50 项）
export type Retry = {
  retryCount: number
  retryCrossProviderCount: number
  retryIntervalSeconds: number
  noRetryStatusCodes: number[]
}

export const getRetry = () => apiCall<Retry>('/api/retry')
export const saveRetry = (patch: Partial<Retry>) =>
  apiCall<Retry>('/api/retry', { method: 'PUT', body: patch })

// ── 排队等待 ─────────────────────────────────────────────────
export type Queue = {
  queueMaxWaits: number
  queueWaitSeconds: number
}

export const getQueue = () => apiCall<Queue>('/api/queue')
export const saveQueue = (patch: Partial<Queue>) =>
  apiCall<Queue>('/api/queue', { method: 'PUT', body: patch })

// ── 数据保留 ─────────────────────────────────────────────────
export type Retention = {
  logRetentionDays: number
  logRetentionCount: number
  requestLogRetentionDays: number
  requestLogRetentionCount: number
  dailyAggregateRetentionDays: number
}

export const getRetention = () => apiCall<Retention>('/api/retention')
export const saveRetention = (patch: Partial<Retention>) =>
  apiCall<Retention>('/api/retention', { method: 'PUT', body: patch })

// ── 网关跨域 ─────────────────────────────────────────────────
export type Cors = { corsEnabled: boolean }

export const getCors = () => apiCall<Cors>('/api/cors')
export const saveCors = (corsEnabled: boolean) =>
  apiCall<Cors>('/api/cors', { method: 'PUT', body: { corsEnabled } })

// ── 内容审核指纹剥离 ─────────────────────────────────────────
// GET 回的字段比开关多得多（规则表、provider/role 选项、上下限）。
// 手机端只做「总开关」，规则表逐条编辑仍留给桌面端 —— 那是一张
// 需要横向滚动的 pattern 表格，手机上编辑只会改坏。
export type SanitizeSettings = {
  sanitizeBlacklistFingerprints: boolean
  providerOptions?: Array<{ id: string; label: string }>
  roleOptions?: string[]
  limits?: Record<string, unknown>
  [key: string]: unknown
}

export const getSanitize = () => apiCall<SanitizeSettings>('/api/sanitize')
export const saveSanitize = (patch: Record<string, unknown>) =>
  apiCall<SanitizeSettings>('/api/sanitize', { method: 'PUT', body: patch })

// ── 客户端伪装设置（Cline 伪装头等）──────────────────────────
export const getClientIdentification = () =>
  apiCall<Record<string, unknown>>('/api/client-identification')
export const saveClientIdentification = (patch: Record<string, unknown>) =>
  apiCall<Record<string, unknown>>('/api/client-identification', {
    method: 'PUT',
    body: patch,
  })
