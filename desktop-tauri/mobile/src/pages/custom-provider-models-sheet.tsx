import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  Input,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@ui'
import { apiCall } from '../api/client'
import { ErrorNote, SkeletonList } from '../components/ui'
import { store } from '../state/store'
import { t } from '../i18n'

/**
 * 自定义提供商的模型清单。
 *
 * 没有这一步，刚建好的自定义提供商是个空壳：转发时按 id 找不到模型就直接
 * 404。桌面端一直是「拉上游清单 → 勾选 → 整表保存」，手机端只读了列表，
 * 所以自建上游在手机上永远跑不起来。
 *
 * ── 口径 ────────────────────────────────────────────────
 * · 拉取是 `POST /api/custom-providers/fetch-models`，只返回上游的模型 id
 *   字符串数组，**不落库**（服务端注释写明「未保存，待确认」）。
 * · 保存是 `POST /api/custom-providers/models`，`models` 是**整表替换**。
 *   所以这里必须把已有的条目原样带上 —— 只提交新勾的那几个会把旧条目全删掉，
 *   连带把它们的 `reasoning` / `capabilities` 覆盖没了。
 */

type ModelItem = {
  id: string
  enabled?: boolean
  reasoning?: string
  capabilities?: Record<string, unknown>
  [key: string]: unknown
}

type CustomProvider = {
  id?: string
  name?: string
  baseUrl?: string
  protocol?: string
  models?: ModelItem[]
  mappings?: Array<Record<string, unknown>>
}

export function CustomProviderModelsSheet({
  providerId,
  onClose,
  onSaved,
}: {
  providerId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [provider, setProvider] = useState<CustomProvider | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState<string[]>([])
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const payload = await apiCall<{ providers?: CustomProvider[] }>('/api/custom-providers')
      const hit = (payload.providers || []).find(item => String(item.id || '') === providerId) || null
      setProvider(hit)
      setSelected(new Set((hit?.models || []).map(item => String(item.id || '')).filter(Boolean)))
      setError('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  useEffect(() => { void load() }, [providerId])

  /** 候选 = 已保存的 + 刚拉到的 + 手填的，按 id 去重后排序。 */
  const candidates = useMemo(() => {
    const ids = new Set<string>()
    for (const item of provider?.models || []) if (item.id) ids.add(String(item.id))
    for (const id of extra) ids.add(id)
    return [...ids].sort((a, b) => a.localeCompare(b))
  }, [provider, extra])

  const fetchModels = async () => {
    setBusy('fetch')
    setError('')
    try {
      const payload = await apiCall<{ models?: string[] }>('/api/custom-providers/fetch-models', {
        method: 'POST',
        body: { providerId },
      })
      const ids = (payload.models || []).map(String)
      setExtra(previous => [...new Set([...previous, ...ids])])
      // 拉到的默认全勾上 —— 「拉清单」这个动作本身就表达了「我要这些」。
      setSelected(previous => new Set([...previous, ...ids]))
      store.toast(ids.length ? t('拉到 {n} 个模型，确认后保存', { n: ids.length }) : t('上游没有返回模型'))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy('')
    }
  }

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const addManual = () => {
    const id = manual.trim()
    if (!id) return
    setExtra(previous => previous.includes(id) ? previous : [...previous, id])
    setSelected(previous => new Set([...previous, id]))
    setManual('')
  }

  const save = async () => {
    setBusy('save')
    setError('')
    try {
      const existing = new Map((provider?.models || []).map(item => [String(item.id || ''), item]))
      // 勾选的按原条目保序输出：已有条目原样带回来（保住 reasoning / capabilities），
      // 新条目给最小形状。
      const models = candidates
        .filter(id => selected.has(id))
        .map(id => existing.get(id) || { id, enabled: true })
      await apiCall('/api/custom-providers/models', {
        method: 'POST',
        body: { providerId, models },
      })
      store.toast(t('模型清单已保存（{n} 个）', { n: models.length }))
      onSaved()
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
          <SheetTitle>{t('模型清单')}</SheetTitle>
          <p className='m-mono' style={{ fontSize: 11, color: 'var(--m-text-3)', marginTop: 4, wordBreak: 'break-all' }}>
            {provider?.name || providerId} · {provider?.baseUrl || ''}
          </p>
        </SheetHeader>

        <SheetBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 11.5, color: 'var(--m-text-3)', lineHeight: 1.6 }}>
              {t('只有勾选的模型能对外转发。拉取会用该提供商第一条账号的凭证去请求上游 /models。')}
            </p>

            <Button variant='outline' disabled={Boolean(busy)} onClick={() => void fetchModels()}>
              {busy === 'fetch' ? t('拉取中…') : t('从上游拉取模型')}
            </Button>

            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                value={manual}
                placeholder={t('手动添加一个模型 id')}
                onChange={event => setManual(event.currentTarget.value)}
                onKeyDown={event => { if (event.key === 'Enter') addManual() }}
              />
              <Button variant='outline' disabled={!manual.trim()} onClick={addManual}>{t('添加')}</Button>
            </div>

            {!provider ? <SkeletonList rows={3} height={40} /> : null}

            {provider && !candidates.length ? (
              <p style={{ fontSize: 11.5, color: 'var(--m-text-3)' }}>
                {t('还没有模型。点上面的「从上游拉取模型」，或手动填一个 id。')}
              </p>
            ) : null}

            {candidates.length ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {candidates.map(id => (
                  <label
                    key={id}
                    htmlFor={`m-${id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 0',
                      borderBottom: '1px solid var(--m-line)',
                      cursor: 'pointer',
                    }}
                  >
                    <Checkbox
                      id={`m-${id}`}
                      checked={selected.has(id)}
                      onCheckedChange={() => toggle(id)}
                    />
                    <span className='m-mono' style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {id}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}

            {error ? <ErrorNote text={error} /> : null}
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant='outline' disabled={Boolean(busy)} onClick={onClose}>{t('取消')}</Button>
          <Button disabled={Boolean(busy)} onClick={() => void save()}>
            {busy === 'save' ? t('保存中…') : t('保存（{n} 个）', { n: selected.size })}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
