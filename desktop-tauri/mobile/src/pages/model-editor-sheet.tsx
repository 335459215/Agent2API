import { useMemo, useState } from 'react'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
} from '@ui'
import { Icon } from '../components/Icon'
import { ErrorNote } from '../components/ui'
import { store } from '../state/store'
import { t } from '../i18n'
import {
  removeModelMapping,
  saveModelCapabilities,
  saveModelMapping,
  type ManageMapping,
  type ManageModel,
  type ManageView,
} from '../api/gateway'
import { modelReasoning } from '../../../ui-shared/models-reasoning'

/**
 * 单个模型的完整编辑器：能力位 + 对外映射。
 *
 * 手机上原本把这两块推给桌面端，理由是「表格式编辑放不进窄屏」。实际用起来
 * 恰恰相反：出差时想给某个模型补一条别名或换个上下文窗口，回桌面端的成本
 * 远高于在手机上点几下。所以这里把桌面端的宽表拆成两段纵向表单：
 *
 *   1. 能力位 —— 6 个固定键（token 两个、开关四个），空 = 不覆盖、跟随上游。
 *   2. 映射   —— 这模型的别名清单，逐条可改思考等级 / 开关 / 删除，底部可新增。
 *
 * `capabilities` 只提交**改动过的键**：后端把缺席当「不动」、`null` 当「恢复
 * 跟随上游」，两者语义不同，整表提交会把没碰过的项也写死。
 */

/** 后端 `capability::KEYS` 的六个键，顺序与桌面端一致。 */
const TOKEN_KEYS = ['maxInputTokens', 'maxOutputTokens'] as const
const BOOL_KEYS = ['supportsToolCall', 'supportsImages', 'supportsVideo', 'supportsReasoning'] as const

const BOOL_LABELS: Record<string, string> = {
  supportsToolCall: '工具调用',
  supportsImages: '图片输入',
  supportsVideo: '视频输入',
  supportsReasoning: '思考 / 推理',
}

export function ModelEditorSheet({
  model,
  mappings,
  onClose,
  onSaved,
}: {
  model: ManageModel
  mappings: ManageMapping[]
  onClose: () => void
  onSaved: (view: ManageView) => void
}) {
  const provider = String(model.provider || '')
  const modelId = String(model.id || '')

  /** 这个模型自己名下的映射（target 指向它，且提供商一致或未标注）。 */
  const mine = useMemo(
    () => mappings.filter(item => String(item.target || '') === modelId
      && (!item.provider || String(item.provider) === provider)),
    [mappings, modelId, provider],
  )

  const reasoning = modelReasoning(model)
  /** 上游声明的档位；空清单时下拉退化成自由输入。 */
  const levels = reasoning.levels || []

  const raw = (model.capabilities && typeof model.capabilities === 'object'
    ? model.capabilities as Record<string, unknown>
    : {})

  const [tokens, setTokens] = useState<Record<string, string>>(() => ({
    maxInputTokens: raw.maxInputTokens != null ? String(raw.maxInputTokens) : '',
    maxOutputTokens: raw.maxOutputTokens != null ? String(raw.maxOutputTokens) : '',
  }))
  const [flags, setFlags] = useState<Record<string, boolean>>(() => ({
    supportsToolCall: Boolean(raw.supportsToolCall),
    supportsImages: Boolean(raw.supportsImages),
    supportsVideo: Boolean(raw.supportsVideo),
    supportsReasoning: Boolean(raw.supportsReasoning),
  }))
  /** 每个能力键是否被用户在本轮改动过 —— 只有改过的才进 payload。 */
  const [touched, setTouched] = useState<Set<string>>(new Set())

  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const [newAlias, setNewAlias] = useState('')
  const [newReasoning, setNewReasoning] = useState('')

  const mark = (key: string) => setTouched(prev => new Set(prev).add(key))

  const applyView = (view: ManageView) => {
    onSaved(view)
  }

  const saveCaps = async () => {
    if (!touched.size) {
      store.toast(t('没有改动'))
      return
    }
    setBusy('caps')
    setError('')
    try {
      const patch: Record<string, boolean | number | null> = {}
      for (const key of TOKEN_KEYS) {
        if (!touched.has(key)) continue
        const text = (tokens[key] || '').trim()
        // 清空 = 恢复跟随上游，用 null 表达；填了数字就按整数提交。
        patch[key] = text ? Math.max(1, Math.floor(Number(text) || 0)) : null
      }
      for (const key of BOOL_KEYS) {
        if (!touched.has(key)) continue
        patch[key] = flags[key]
      }
      const view = await saveModelCapabilities({ provider, id: modelId, capabilities: patch })
      store.toast(t('能力位已保存'))
      setTouched(new Set())
      applyView(view)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy('')
    }
  }

  const addMapping = async () => {
    const alias = newAlias.trim()
    if (!alias) return
    setBusy('add')
    setError('')
    try {
      const view = await saveModelMapping({
        alias,
        target: modelId,
        provider,
        // 空串表示「由后端按三态处理」——不传这个键，保留既有档位。
        ...(newReasoning ? { reasoning: newReasoning } : {}),
      })
      store.toast(t('映射已保存'))
      setNewAlias('')
      applyView(view)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy('')
    }
  }

  const patchMapping = async (item: ManageMapping, patch: { reasoning?: string | null; enabled?: boolean }) => {
    setBusy(`map:${item.alias}`)
    setError('')
    try {
      const view = await saveModelMapping({
        alias: String(item.alias || ''),
        target: String(item.target || ''),
        provider: item.provider ? String(item.provider) : provider,
        ...patch,
      })
      store.toast(t('映射已更新'))
      applyView(view)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy('')
    }
  }

  const dropMapping = async (item: ManageMapping) => {
    setBusy(`map:${item.alias}`)
    setError('')
    try {
      const view = await removeModelMapping({
        alias: String(item.alias || ''),
        target: String(item.target || ''),
        provider: item.provider ? String(item.provider) : provider,
      })
      store.toast(t('映射已删除'))
      applyView(view)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy('')
    }
  }

  return (
    <Sheet open onOpenChange={(open: boolean) => {
      if (!open && !busy) onClose()
    }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('模型设置')}</SheetTitle>
          <p className='m-mono' style={{ fontSize: 11.5, color: 'var(--m-text-3)', marginTop: 4, wordBreak: 'break-all' }}>
            {provider} / {modelId}
          </p>
        </SheetHeader>

        <SheetBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* ── 能力位 ─────────────────────────────── */}
            <section>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{t('对下游声明的能力')}</div>
              <p style={{ fontSize: 11.5, color: 'var(--m-text-3)', lineHeight: 1.6, marginBottom: 12 }}>
                {t('留空 / 不动 = 跟随上游目录。改了就会覆盖该模型对客户端声明的值。')}
              </p>

              {TOKEN_KEYS.map(key => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <Label htmlFor={`cap-${key}`}>{key === 'maxInputTokens' ? t('上下文窗口（tokens）') : t('最大输出（tokens）')}</Label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Input
                      id={`cap-${key}`}
                      inputMode='numeric'
                      value={tokens[key]}
                      placeholder={t('跟随上游')}
                      onChange={event => {
                        const next = event.target.value.replace(/[^\d]/g, '')
                        setTokens(prev => ({ ...prev, [key]: next }))
                        mark(key)
                      }}
                    />
                    {touched.has(key) ? (
                      <Button size='sm' variant='ghost' onClick={() => {
                        setTokens(prev => ({ ...prev, [key]: '' }))
                        mark(key)
                      }}>{t('清空')}</Button>
                    ) : null}
                  </div>
                </div>
              ))}

              {BOOL_KEYS.map(key => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '9px 0',
                    borderBottom: '1px solid var(--m-line)',
                  }}
                >
                  <span style={{ fontSize: 12.5 }}>{t(BOOL_LABELS[key])}</span>
                  <Switch
                    size='touch'
                    variant='success'
                    aria-label={t(BOOL_LABELS[key])}
                    checked={flags[key]}
                    onCheckedChange={next => {
                      setFlags(prev => ({ ...prev, [key]: next === true }))
                      mark(key)
                    }}
                  />
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <Button size='sm' disabled={Boolean(busy) || !touched.size} onClick={() => void saveCaps()}>
                  {busy === 'caps' ? t('保存中…') : t('保存能力位')}
                </Button>
                {touched.size ? (
                  <Button size='sm' variant='ghost' disabled={Boolean(busy)} onClick={() => {
                    setTokens({
                      maxInputTokens: raw.maxInputTokens != null ? String(raw.maxInputTokens) : '',
                      maxOutputTokens: raw.maxOutputTokens != null ? String(raw.maxOutputTokens) : '',
                    })
                    setFlags({
                      supportsToolCall: Boolean(raw.supportsToolCall),
                      supportsImages: Boolean(raw.supportsImages),
                      supportsVideo: Boolean(raw.supportsVideo),
                      supportsReasoning: Boolean(raw.supportsReasoning),
                    })
                    setTouched(new Set())
                  }}>{t('放弃改动')}</Button>
                ) : null}
              </div>
            </section>

            {/* ── 映射 ──────────────────────────────── */}
            <section>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{t('对外映射')}</div>
              <p style={{ fontSize: 11.5, color: 'var(--m-text-3)', lineHeight: 1.6, marginBottom: 12 }}>
                {t('别名是客户端填的模型 ID。同一个上游可以有多个别名，思考等级按别名独立设置。')}
              </p>

              {mine.length ? mine.map(item => {
                const alias = String(item.alias || '')
                const rowBusy = busy === `map:${alias}`
                return (
                  <div
                    key={`${alias}:${item.target}`}
                    style={{ padding: '10px 0', borderBottom: '1px solid var(--m-line)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className='m-mono' style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {alias}
                      </span>
                      <Switch
                        size='touch'
                        variant='success'
                        aria-label={alias}
                        checked={item.enabled !== false}
                        disabled={rowBusy}
                        onCheckedChange={next => void patchMapping(item, { enabled: next === true })}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <Select
                        /**
                         * 直接显示这条映射当前绑定的档位，不要用 `__keep__` 这类内部哨兵值 ——
                         * 那会原样出现在触发器上，用户看到的是 `__keep__` 而不是实际状态。
                         * 空 / null 一律归到「跟随上游」。
                         */
                        value={item.reasoning || '__auto__'}
                        onValueChange={(raw: string | null) => {
                          const value = raw || '__auto__'
                          void patchMapping(item, { reasoning: value === '__auto__' ? null : value })
                        }}
                      >
                        <SelectTrigger style={{ flex: 1 }}>
                          <SelectValue placeholder={t('跟随上游')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='__auto__'>{t('跟随上游')}</SelectItem>
                          {/* 当前值不在候选表里时也要能显示出来，否则触发器会空着 */}
                          {item.reasoning && !levels.includes(String(item.reasoning)) ? (
                            <SelectItem value={String(item.reasoning)}>{String(item.reasoning)}</SelectItem>
                          ) : null}
                          {levels.map(level => (
                            <SelectItem key={level} value={level}>{level}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size='sm' variant='ghost' disabled={rowBusy}
                        onClick={() => void dropMapping(item)}>
                        <Icon name='trash' style={{ width: 13, height: 13 }} />
                      </Button>
                    </div>

                    {reasoning.fixedLevel ? (
                      <p style={{ fontSize: 10.5, color: 'var(--m-text-3)', marginTop: 6 }}>
                        {t('上游固定档位：{level}', { level: reasoning.fixedLevel })}
                      </p>
                    ) : null}
                  </div>
                )
              }) : (
                <p style={{ fontSize: 11.5, color: 'var(--m-text-3)', lineHeight: 1.6 }}>
                  {t('还没有别名的映射。用下面这条加一个，客户端就能用它调用这个模型。')}
                </p>
              )}

              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Input
                  value={newAlias}
                  placeholder={t('新别名，例如 gpt-4o-mini')}
                  onChange={event => setNewAlias(event.target.value)}
                />
                {levels.length ? (
                  <Select value={newReasoning || '__auto__'} onValueChange={(raw: string | null) => setNewReasoning(!raw || raw === '__auto__' ? '' : raw)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('思考等级（可选）')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__auto__'>{t('跟随上游')}</SelectItem>
                      {levels.map(level => (
                        <SelectItem key={level} value={level}>{level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <Button
                  size='sm'
                  variant='outline'
                  disabled={Boolean(busy) || !newAlias.trim()}
                  onClick={() => void addMapping()}
                >
                  <Icon name='plus' style={{ width: 13, height: 13, marginRight: 5 }} />
                  {busy === 'add' ? t('保存中…') : t('添加映射')}
                </Button>
              </div>
            </section>

            {error ? <ErrorNote text={error} /> : null}
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant='outline' disabled={Boolean(busy)} onClick={onClose}>{t('关闭')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
