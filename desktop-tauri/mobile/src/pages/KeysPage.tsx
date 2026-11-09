import { useMemo, useState } from 'react'
import { PageIntro, IconButton, Empty, ErrorNote, SkeletonList, copyWithToast } from '../components/ui'
import { GlyphLogo } from '../components/ProviderLogo'
import { Icon } from '../components/Icon'
import { PullIndicator, usePullToRefresh } from '../components/PullToRefresh'
import { store } from '../state/store'
import {
  createKey,
  deleteKey,
  fetchKeys,
  setKeyEnabled,
  updateKey,
  type GatewayKey,
  type KeysPayload,
  type ProviderSummary,
} from '../api/gateway'
import { providerLabel } from '../lib/providers'
import { usePolling } from '../lib/usePolling'
import { t } from '../i18n'
import { Button, Card, Input, Label, MultiSelect, Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle, Switch as UiSwitch, confirmDialog } from '@ui'

/**
 * 网关 Key。
 *
 * Key 卡直接展示脱敏后的值与复制按钮 —— 这是这一页最高频的动作（复制给
 * 某个客户端）。明文只在展开后才取，默认只显示掩码，避免肩窥。
 *
 * 新建 / 改名字 / 改可用范围都在本页的抽屉里完成：窄屏下多选确实不如桌面
 * 端顺手，用 MultiSelect + 搜索补偿，而不是把整个动作推给桌面端。
 */
export function KeysPage() {
  const [data, setData] = useState<KeysPayload | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  /** undefined = 抽屉关着；null = 新建；对象 = 编辑这一把 */
  const [editing, setEditing] = useState<GatewayKey | null | undefined>(undefined)

  const load = async () => {
    try {
      const next = await fetchKeys()
      setData(next)
      setError('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  usePolling(load, 120_000)

  const pull = usePullToRefresh({ onRefresh: load })

  const keys = data?.keys || []

  const toggle = async (key: GatewayKey, next: boolean) => {
    if (!key.id) return
    setBusy(key.id)
    try {
      const payload = await setKeyEnabled(key.id, next)
      setData(payload)
      store.toast(next ? t('已启用「{name}」', { name: key.name || key.id }) : t('已禁用「{name}」', { name: key.name || key.id }))
    } catch (failure) {
      store.toast(failure instanceof Error ? failure.message : String(failure), 'err')
    } finally {
      setBusy('')
    }
  }

  const remove = async (key: GatewayKey) => {
    if (!key.id) return
    if (!await confirmDialog(t('确定删除「{name}」？用这把 Key 的客户端会立即失效。', { name: key.name || key.id }))) return
    setBusy(key.id)
    try {
      const payload = await deleteKey(key.id)
      setData(payload)
      store.toast(t('已删除'))
    } catch (failure) {
      store.toast(failure instanceof Error ? failure.message : String(failure), 'err')
    } finally {
      setBusy('')
    }
  }

  const toggleReveal = (id: string) => {
    const next = new Set(revealed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setRevealed(next)
  }

  return (
    <div className='m-page' ref={pull.bindRef}>
      <PullIndicator pull={pull.pull} refreshing={pull.refreshing} />
      <PageIntro
        actions={
          <>
            <IconButton name='refresh' label={t('刷新')} onClick={() => void load()} />
            <IconButton name='plus' label={t('新建 Key')} onClick={() => setEditing(null)} />
          </>
        }
      />

      <div className='m-section' style={{ marginTop: 0 }}>
        <Card
          className='m-card m-card-pad'
          style={{ background: 'var(--m-primary-soft)', borderColor: 'var(--m-primary-line)' }}
        >
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--m-text-2)' }}>
            {t('客户端请求带上 ')}
            <span className='m-mono' style={{ fontSize: 11.5, color: 'var(--m-primary)' }}>
              Authorization: Bearer &lt;Key&gt;
            </span>
            {t('；当前必须带 Key。')}
          </div>
        </Card>
      </div>

      {error ? <ErrorNote text={error} /> : null}
      {!data ? <SkeletonList rows={3} height={120} /> : null}

      {data && !keys.length ? (
        <div className='m-section'>
          <Card className='m-card'>
            <Empty text={t('还没有 Key。点右上角 + 新建一把。')} />
          </Card>
        </div>
      ) : null}

      {keys.map(key => {
        const id = String(key.id || '')
        const shown = revealed.has(id)
        const value = shown ? key.key || '' : key.masked || maskKey(key.key)
        return (
          <div key={id} className='m-section' style={{ marginTop: 10 }}>
            <Card className='m-card m-card-pad'>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <GlyphLogo name='key' />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {key.name || t('未命名')}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--m-text-3)', marginTop: 2 }}>
                    {scopeText(key)}
                  </div>
                </div>
                <SwitchSmall
                  checked={Boolean(key.enabled)}
                  disabled={busy === id}
                  label={key.name || id}
                  onChange={next => void toggle(key, next)}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 10,
                  padding: '8px 10px',
                  borderRadius: 9,
                  background: 'var(--m-surface-2)',
                  border: '1px solid var(--m-line)',
                }}
              >
                <span
                  className='m-mono'
                  style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--m-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {value}
                </span>
                <Button size='default' variant='ghost'
                  type='button'
                  onClick={() => toggleReveal(id)}
                  aria-label={shown ? t('隐藏') : t('显示')}
                  style={{ display: 'flex', border: 0, background: 'none', color: 'var(--m-text-3)', padding: 2 }}
                >
                  <Icon name='eye' style={{ width: 15, height: 15, opacity: shown ? 1 : 0.55 }} />
                </Button>
                <Button size='default' variant='ghost'
                  type='button'
                  onClick={() => void copyWithToast(key.key || '', key.name || t('网关 Key'))}
                  aria-label={t('复制')}
                  style={{ display: 'flex', border: 0, background: 'none', color: 'var(--m-primary)', padding: 2 }}
                >
                  <Icon name='copy' style={{ width: 15, height: 15 }} />
                </Button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9, fontSize: 11.5, color: 'var(--m-text-3)' }}>
                <span>{key.enabled ? t('已启用') : t('已停用')}</span>
                <span>{t('创建于 {time}', { time: key.createdAt ? new Date(key.createdAt).toLocaleDateString('zh-CN') : '—' })}</span>
                <Button size='default' variant='ghost'
                  type='button'
                  onClick={() => setEditing(key)}
                  disabled={busy === id}
                  style={{
                    marginLeft: 'auto',
                    border: 0,
                    background: 'none',
                    color: 'var(--m-text-2)',
                    fontSize: 11.5,
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Icon name='edit' style={{ width: 13, height: 13 }} />
                  {t('编辑')}
                </Button>
                <Button size='default' variant='ghost'
                  type='button'
                  onClick={() => void remove(key)}
                  disabled={busy === id}
                  style={{
                    border: 0,
                    background: 'none',
                    color: 'var(--m-danger)',
                    fontSize: 11.5,
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Icon name='trash' style={{ width: 13, height: 13 }} />
                  {t('删除')}
                </Button>
              </div>
            </Card>
          </div>
        )
      })}

      <div className='m-section' style={{ paddingBottom: 8 }}>
        <Card className='m-card m-card-pad' style={{ fontSize: 11.5, color: 'var(--m-text-3)', lineHeight: 1.7 }}>
          {t('可用范围留空表示不限制：这把 Key 能调用所有已启用提供商与模型。填了白名单就只放行勾选的项。')}
        </Card>
      </div>

      {editing !== undefined ? (
        <KeyEditor
          item={editing}
          providers={data?.providers || []}
          modelsByProvider={data?.modelsByProvider || {}}
          onClose={() => setEditing(undefined)}
          onSaved={payload => {
            setData(payload)
            setEditing(undefined)
          }}
        />
      ) : null}
    </div>
  )
}

/** 新建 / 编辑一把 Key。整份表单在抽屉里，关掉即丢弃草稿。 */
function KeyEditor({
  item,
  providers,
  modelsByProvider,
  onClose,
  onSaved,
}: {
  item: GatewayKey | null
  providers: ProviderSummary[]
  modelsByProvider: Record<string, string[]>
  onClose: () => void
  onSaved: (payload: KeysPayload) => void
}) {
  const [name, setName] = useState(item?.name || '')
  const [value, setValue] = useState('')
  const [allowedProviders, setAllowedProviders] = useState<string[]>(item?.allowedProviders || [])
  const [allowedModels, setAllowedModels] = useState<string[]>(item?.allowedModels || [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const providerOptions = useMemo(
    () => providers.map(p => ({ value: String(p.id || ''), label: providerLabel(String(p.id || ''), p.label) })).filter(o => o.value),
    [providers],
  )

  /**
   * 模型候选：选了提供商就只列这几家的模型（桌面端同一口径）；一家都没选时
   * 给全集，方便「只挑几个模型、不限提供商」这种用法。
   */
  const modelOptions = useMemo(() => {
    const sources = allowedProviders.length ? allowedProviders : Object.keys(modelsByProvider)
    const seen = new Set<string>()
    const options: { value: string; label: string }[] = []
    for (const provider of sources) {
      for (const model of modelsByProvider[provider] || []) {
        if (seen.has(model)) continue
        seen.add(model)
        options.push({ value: model, label: model })
      }
    }
    return options.sort((a, b) => a.label.localeCompare(b.label))
  }, [allowedProviders, modelsByProvider])

  /** 换提供商后，把不再属于所选范围的模型勾选去掉 —— 否则保存时会被后端 400 挡回。 */
  const pickProviders = (next: string[]) => {
    setAllowedProviders(next)
    if (!next.length || !allowedModels.length) return
    const allowed = new Set(next.flatMap(id => modelsByProvider[id] || []))
    const kept = allowedModels.filter(model => allowed.has(model))
    if (kept.length !== allowedModels.length) setAllowedModels(kept)
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const trimmed = name.trim()
      if (item?.id) {
        const payload = await updateKey(item.id, { name: trimmed, allowedProviders, allowedModels })
        store.toast(t('已保存'))
        onSaved(payload)
      } else {
        const payload = await createKey({
          name: trimmed,
          key: value.trim() || undefined,
          allowedProviders,
          allowedModels,
        })
        /**
         * 建完把这把 Key 存进本地 —— 但**只存不受限的**。
         *
         * 库里一旦有 Key，`/api/*` 全都要鉴权；而注册过管理员之后，受限 Key
         * 还会被管理面直接挡回（`403 management_access_denied`）。把一把带
         * 白名单的 Key 存成本机凭证，等于让这个面板当场把自己锁在门外 ——
         * 那种 Key 是发给客户端用的，不是用来开面板的。
         */
        const created = payload.created
        const restricted = Boolean(
          (created?.allowedProviders?.length) || (created?.allowedModels?.length),
        )
        if (created?.key && !restricted) {
          const { storeApiKey } = await import('../api/client')
          storeApiKey(created.key)
          store.toast(t('已创建，本机已自动带上这把 Key'))
        } else if (created?.key) {
          store.toast(t('已创建。这是受限 Key，请复制给客户端使用；面板不会自动采用它'), 'warn')
        } else {
          store.toast(t('已创建'))
        }
        onSaved(payload)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(open: boolean) => { if (!open && !busy) onClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{item?.id ? t('编辑 Key') : t('新建 Key')}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <Label htmlFor='key-name'>{t('名称')}</Label>
              <Input
                id='key-name'
                value={name}
                placeholder={t('例如：手机客户端')}
                onChange={event => setName(event.target.value)}
              />
            </div>

            {item?.id ? null : (
              <div>
                <Label htmlFor='key-value'>{t('Key 值（留空自动生成）')}</Label>
                <Input
                  id='key-value'
                  value={value}
                  placeholder={t('缺省由网关生成一串随机 Key')}
                  onChange={event => setValue(event.target.value)}
                />
              </div>
            )}

            <div>
              <Label>{t('可用提供商（不选 = 不限）')}</Label>
              <MultiSelect
                value={allowedProviders}
                onValueChange={(items: string[]) => pickProviders(items)}
                options={providerOptions}
                placeholder={t('不限提供商')}
                searchPlaceholder={t('搜索提供商')}
                emptyHint={t('没有匹配的提供商')}
                aria-label={t('可用提供商')}
              />
            </div>

            <div>
              <Label>{t('可用模型（不选 = 不限）')}</Label>
              <MultiSelect
                value={allowedModels}
                onValueChange={(items: string[]) => setAllowedModels(items)}
                options={modelOptions}
                placeholder={t('不限模型')}
                searchPlaceholder={t('搜索模型')}
                emptyHint={t('这个范围内没有模型')}
                aria-label={t('可用模型')}
              />
              <p style={{ fontSize: 11.5, color: 'var(--m-text-3)', lineHeight: 1.6, marginTop: 6 }}>
                {t('先选提供商，模型候选会跟着收窄；两家都不填就是这把 Key 全放行。')}
              </p>
            </div>

            {error ? <ErrorNote text={error} /> : null}
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant='outline' disabled={busy} onClick={onClose}>{t('取消')}</Button>
          <Button disabled={busy} onClick={() => void save()}>{busy ? t('保存中…') : t('保存')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function scopeText(key: GatewayKey): string {
  const providers = key.allowedProviders || []
  const models = key.allowedModels || []
  if (!providers.length && !models.length) return t('不限制提供商与模型')
  const parts: string[] = []
  if (providers.length) parts.push(providers.map(id => providerLabel(id)).join('、'))
  if (models.length) parts.push(t('{n} 个模型', { n: models.length }))
  return t('限制：{text}', { text: parts.join(' / ') })
}

function maskKey(key?: string): string {
  if (!key) return '—'
  if (key.length <= 10) return '••••••'
  return `${key.slice(0, 7)}••••••${key.slice(-4)}`
}

function SwitchSmall({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <UiSwitch size='touch' variant='success' checked={checked} aria-label={label} disabled={disabled} onCheckedChange={onChange} />
  )
}
