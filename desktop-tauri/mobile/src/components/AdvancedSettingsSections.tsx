/**
 * 高级设置面板 —— 手机端补齐桌面端独有的配置项。
 *
 * ── 这批设置原本为什么只在桌面端 ────────────────────────────
 * 手机端源码里曾写着：「端口、路由、重试、超时、数据保留这些
 * 需要看文档才能填对的，一律留在桌面端 —— 摆出来只会让人误改」。
 * 这个判断对「小白第一次装机」成立，对「用手机管一台常驻网关」
 * 不成立：改个超时值要开电脑，成本远高于填错一个数字后改回来。
 *
 * 所以这里按**就地可改 + 有约束提示**的方式补上，而不是照搬桌面端的
 * 大段表单：每个数字都写清单位和合法区间，保存时由后端校验兜底
 * （越界一律 400，不会写坏配置）。
 */
import { useEffect, useState } from 'react'
import { Card, Input, Switch as UiSwitch } from '@ui'
import { SectionHead, ErrorNote } from '../components/ui'
import { t } from '../i18n'
import * as adv from '../api/advanced-settings'

// ── 小组件 ───────────────────────────────────────────────────

/** 一行「标签 + 数字输入」。blur 或回车时提交，非法输入就地标红。 */
function NumberRow({
  label,
  hint,
  value,
  min,
  max,
  unit,
  onCommit,
  disabled,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  unit?: string
  onCommit: (next: number) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(String(value))
  const [bad, setBad] = useState(false)

  // 外部值变化（保存成功后后端回填）时同步输入框
  useEffect(() => {
    setDraft(String(value))
    setBad(false)
  }, [value])

  const commit = () => {
    const n = Number(draft.trim())
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
      setBad(true)
      return
    }
    setBad(false)
    if (n !== value) onCommit(n)
  }

  return (
    <div className='m-row' style={{ alignItems: 'flex-start' }}>
      <div className='m-grow'>
        <div className='m-t1'>{label}</div>
        {hint ? <div className='m-t2'>{hint}</div> : null}
        {bad ? (
          <div className='m-t2' style={{ color: 'var(--m-danger, #d33)' }}>
            {t('请输入 {min}–{max} 之间的整数', { min: String(min), max: String(max) })}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Input
          inputMode='numeric'
          value={draft}
          disabled={disabled}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          style={{
            width: 76,
            textAlign: 'right',
            borderColor: bad ? 'var(--m-danger, #d33)' : undefined,
            flexShrink: 0,
          }}
        />
        {unit ? <span className='m-t2'>{unit}</span> : null}
      </div>
    </div>
  )
}

/** 一行「标签 + 开关」。 */
function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className='m-row'>
      <div className='m-grow'>
        <div className='m-t1'>{label}</div>
        {hint ? <div className='m-t2'>{hint}</div> : null}
      </div>
      <UiSwitch
        size='touch'
        variant='success'
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={label}
      />
    </div>
  )
}

/** 面板外壳：加载中/出错/正常三态统一。 */
function Panel({
  title,
  loading,
  error,
  children,
}: {
  title: string
  loading: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className='m-section'>
      <SectionHead title={title} />
      <Card className='m-card'>
        {loading ? <div className='m-row m-t2'>{t('读取中…')}</div> : null}
        {!loading && error ? <div className='m-row'><ErrorNote text={error} /></div> : null}
        {!loading && !error ? children : null}
      </Card>
    </div>
  )
}

// ── 各分区 ───────────────────────────────────────────────────

function TimeoutsSection({ toast }: { toast: (m: string) => void }) {
  const [data, setData] = useState<adv.Timeouts | null>(null)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    adv
      .getTimeouts()
      .then(setData)
      .catch(e => setError(String(e?.message || e)))
  }, [])

  const save = (patch: Partial<adv.Timeouts>) => {
    setBusy(true)
    adv
      .saveTimeouts(patch)
      .then(next => {
        setData(next)
        toast(t('已保存'))
      })
      .catch(e => toast(t('保存失败：{msg}', { msg: String(e?.message || e) })))
      .finally(() => setBusy(false))
  }

  return (
    <Panel title={t('请求超时')} loading={!data && !error} error={error}>
      {data ? (
        <>
          <NumberRow
            label={t('连接超时')}
            hint={t('建立 TCP/TLS 连接的最长等待')}
            unit={t('秒')}
            min={1}
            max={3600}
            value={data.connectTimeoutSeconds}
            disabled={busy}
            onCommit={v => save({ connectTimeoutSeconds: v })}
          />
          <NumberRow
            label={t('等待响应头')}
            hint={t('发出请求到收到首字节')}
            unit={t('秒')}
            min={1}
            max={3600}
            value={data.headersTimeoutSeconds}
            disabled={busy}
            onCommit={v => save({ headersTimeoutSeconds: v })}
          />
          <NumberRow
            label={t('流空闲超时')}
            hint={t('流式响应两段数据之间的最长间隔，调大能容忍慢模型')}
            unit={t('秒')}
            min={1}
            max={3600}
            value={data.streamIdleTimeoutSeconds}
            disabled={busy}
            onCommit={v => save({ streamIdleTimeoutSeconds: v })}
          />
          <NumberRow
            label={t('非流式总时长')}
            hint={t('一次性返回的请求整体上限')}
            unit={t('秒')}
            min={1}
            max={3600}
            value={data.bodyTimeoutSeconds}
            disabled={busy}
            onCommit={v => save({ bodyTimeoutSeconds: v })}
          />
        </>
      ) : null}
    </Panel>
  )
}

function RetrySection({ toast }: { toast: (m: string) => void }) {
  const [data, setData] = useState<adv.Retry | null>(null)
  const [codes, setCodes] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    adv
      .getRetry()
      .then(d => {
        setData(d)
        setCodes(d.noRetryStatusCodes.join(', '))
      })
      .catch(e => setError(String(e?.message || e)))
  }, [])

  const save = (patch: Partial<adv.Retry>) => {
    setBusy(true)
    adv
      .saveRetry(patch)
      .then(next => {
        setData(next)
        setCodes(next.noRetryStatusCodes.join(', '))
        toast(t('已保存'))
      })
      .catch(e => toast(t('保存失败：{msg}', { msg: String(e?.message || e) })))
      .finally(() => setBusy(false))
  }

  const commitCodes = () => {
    const parsed = codes
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(s => Number(s))
    const bad = parsed.some(n => !Number.isInteger(n) || n < 100 || n > 599)
    if (bad || parsed.length > 50) {
      toast(t('状态码须是 100–599 的整数，最多 50 个'))
      return
    }
    save({ noRetryStatusCodes: Array.from(new Set(parsed)).sort((a, b) => a - b) })
  }

  return (
    <Panel title={t('请求重试')} loading={!data && !error} error={error}>
      {data ? (
        <>
          <NumberRow
            label={t('重试次数')}
            hint={t('同一账号内的重试次数')}
            min={0}
            max={20}
            value={data.retryCount}
            disabled={busy}
            onCommit={v => save({ retryCount: v })}
          />
          <NumberRow
            label={t('换号次数')}
            hint={t('重试仍失败后切换账号的次数')}
            min={0}
            max={20}
            value={data.retryCrossProviderCount}
            disabled={busy}
            onCommit={v => save({ retryCrossProviderCount: v })}
          />
          <NumberRow
            label={t('重试间隔')}
            unit={t('秒')}
            min={0}
            max={300}
            value={data.retryIntervalSeconds}
            disabled={busy}
            onCommit={v => save({ retryIntervalSeconds: v })}
          />
          <div className='m-row' style={{ alignItems: 'flex-start' }}>
            <div className='m-grow'>
              <div className='m-t1'>{t('直接换号的状态码')}</div>
              <div className='m-t2'>{t('逗号分隔，例如 401, 429')}</div>
            </div>
          </div>
          <div className='m-row'>
            <Input
              className='m-grow'
              value={codes}
              disabled={busy}
              onChange={e => setCodes(e.target.value)}
              onBlur={commitCodes}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
          </div>
        </>
      ) : null}
    </Panel>
  )
}

function QueueSection({ toast }: { toast: (m: string) => void }) {
  const [data, setData] = useState<adv.Queue | null>(null)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    adv
      .getQueue()
      .then(setData)
      .catch(e => setError(String(e?.message || e)))
  }, [])

  const save = (patch: Partial<adv.Queue>) => {
    setBusy(true)
    adv
      .saveQueue(patch)
      .then(next => {
        setData(next)
        toast(t('已保存'))
      })
      .catch(e => toast(t('保存失败：{msg}', { msg: String(e?.message || e) })))
      .finally(() => setBusy(false))
  }

  return (
    <Panel title={t('排队等待')} loading={!data && !error} error={error}>
      {data ? (
        <>
          <NumberRow
            label={t('最多排队次数')}
            hint={t('所有账号都忙时，最多排几轮')}
            min={0}
            max={50}
            value={data.queueMaxWaits}
            disabled={busy}
            onCommit={v => save({ queueMaxWaits: v })}
          />
          <NumberRow
            label={t('每轮等待')}
            unit={t('秒')}
            min={0}
            max={600}
            value={data.queueWaitSeconds}
            disabled={busy}
            onCommit={v => save({ queueWaitSeconds: v })}
          />
        </>
      ) : null}
    </Panel>
  )
}

function RetentionSection({ toast }: { toast: (m: string) => void }) {
  const [data, setData] = useState<adv.Retention | null>(null)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    adv
      .getRetention()
      .then(setData)
      .catch(e => setError(String(e?.message || e)))
  }, [])

  const save = (patch: Partial<adv.Retention>) => {
    setBusy(true)
    adv
      .saveRetention(patch)
      .then(next => {
        setData(next)
        toast(t('已保存'))
      })
      .catch(e => toast(t('保存失败：{msg}', { msg: String(e?.message || e) })))
      .finally(() => setBusy(false))
  }

  return (
    <Panel title={t('数据保留')} loading={!data && !error} error={error}>
      {data ? (
        <>
          <NumberRow
            label={t('事件日志保留')}
            unit={t('天')}
            min={1}
            max={3650}
            value={data.logRetentionDays}
            disabled={busy}
            onCommit={v => save({ logRetentionDays: v })}
          />
          <NumberRow
            label={t('请求日志保留')}
            unit={t('天')}
            min={1}
            max={3650}
            value={data.requestLogRetentionDays}
            disabled={busy}
            onCommit={v => save({ requestLogRetentionDays: v })}
          />
          <NumberRow
            label={t('每日汇总保留')}
            unit={t('天')}
            min={1}
            max={3650}
            value={data.dailyAggregateRetentionDays}
            disabled={busy}
            onCommit={v => save({ dailyAggregateRetentionDays: v })}
          />
          <NumberRow
            label={t('事件日志条数上限')}
            hint={t('0 表示不限')}
            unit={t('条')}
            min={0}
            max={10000000}
            value={data.logRetentionCount}
            disabled={busy}
            onCommit={v => save({ logRetentionCount: v })}
          />
          <NumberRow
            label={t('请求日志条数上限')}
            hint={t('0 表示不限')}
            unit={t('条')}
            min={0}
            max={10000000}
            value={data.requestLogRetentionCount}
            disabled={busy}
            onCommit={v => save({ requestLogRetentionCount: v })}
          />
        </>
      ) : null}
    </Panel>
  )
}

function SecuritySection({ toast }: { toast: (m: string) => void }) {
  const [cors, setCors] = useState<boolean | null>(null)
  const [sanitize, setSanitize] = useState<boolean | null>(null)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([adv.getCors(), adv.getSanitize()])
      .then(([c, s]) => {
        setCors(c.corsEnabled)
        setSanitize(s.sanitizeBlacklistFingerprints)
      })
      .catch(e => setError(String(e?.message || e)))
  }, [])

  return (
    <Panel
      title={t('安全')}
      loading={cors === null && sanitize === null && !error}
      error={error}
    >
      <SwitchRow
        label={t('网关跨域访问')}
        hint={t('允许浏览器从别的域名直接调 /v1，默认关闭更安全')}
        checked={Boolean(cors)}
        disabled={busy}
        onChange={next => {
          setBusy(true)
          adv
            .saveCors(next)
            .then(r => {
              setCors(r.corsEnabled)
              toast(t('已保存'))
            })
            .catch(e => toast(t('保存失败：{msg}', { msg: String(e?.message || e) })))
            .finally(() => setBusy(false))
        }}
      />
      <SwitchRow
        label={t('剥离审核指纹')}
        hint={t('发送前去掉易触发内容审核的特征字段；规则表在设置页的「安全」分区逐条维护')}
        checked={Boolean(sanitize)}
        disabled={busy}
        onChange={next => {
          setBusy(true)
          adv
            .saveSanitize({ sanitizeBlacklistFingerprints: next })
            .then(r => {
              setSanitize(r.sanitizeBlacklistFingerprints)
              toast(t('已保存'))
            })
            .catch(e => toast(t('保存失败：{msg}', { msg: String(e?.message || e) })))
            .finally(() => setBusy(false))
        }}
      />
    </Panel>
  )
}

// ── 汇总导出 ─────────────────────────────────────────────────

/**
 * 把所有高级分区按顺序渲染。设置页把它放在「接入」之后。
 *
 * `toast` 由设置页传进来（它已经是 store.toast），避免这里重复接线。
 */
export function AdvancedSettingsSections({ toast }: { toast: (m: string) => void }) {
  return (
    <>
      <TimeoutsSection toast={toast} />
      <RetrySection toast={toast} />
      <QueueSection toast={toast} />
      <RetentionSection toast={toast} />
      <SecuritySection toast={toast} />
    </>
  )
}
