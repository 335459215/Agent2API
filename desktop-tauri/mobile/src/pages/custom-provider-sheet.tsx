import { useState } from 'react'
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
} from '@ui'
import { apiCall } from '../api/client'
import { ErrorNote } from '../components/ui'
import { store } from '../state/store'
import { t } from '../i18n'

/**
 * 新建自定义提供商（用户自建的上游端点）。
 *
 * 桌面端一直只有它有这个入口，手机端只读列表 —— 结果是想接自己的上游只能
 * 回电脑。这里把它补齐，一屏填完三件事：叫什么、说什么协议、打哪个地址。
 *
 * ── 两个容易踩的点 ─────────────────────────────────────────
 * · `POST /api/custom-providers` **会顺带建一条账号**（后端把同一个 payload
 *   去掉 `baseUrl` 之后交给 `add_custom_account`）。所以 `apiKey` 直接写在这里
 *   就同时落到了账号上，不需要建完再走一遍「编辑凭证」。
 * · Base URL 的写法跟协议绑定：`chat_completions` / `responses` 惯例**带
 *   `/v1`**（如 `https://api.example.com/v1`），`anthropic` 则按上游给的原样
 *   （通常不带 `/v1`，那是 SDK 自己拼的）。填错不会报错，只会在转发时 404，
 *   所以这里的 helper 文案要把它说清楚。
 */

const PROTOCOLS = [
  { value: 'chat_completions', label: 'OpenAI Chat Completions', hint: '最常见；地址一般以 /v1 结尾' },
  { value: 'responses', label: 'OpenAI Responses', hint: '新版的 /v1/responses 协议' },
  { value: 'anthropic', label: 'Anthropic Messages', hint: '通常不带 /v1，由上游自己拼' },
] as const

export function CustomProviderSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [protocol, setProtocol] = useState<string>('chat_completions')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const hint = PROTOCOLS.find(item => item.value === protocol)?.hint || ''
  const ready = name.trim().length > 0 && baseUrl.trim().length > 0

  const save = async () => {
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      await apiCall('/api/custom-providers', {
        method: 'POST',
        body: {
          name: name.trim(),
          protocol,
          baseUrl: baseUrl.trim(),
          // 留空就不带这个键：账号会以「无凭证」建出来，之后再补也一样。
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        },
      })
      store.toast(t('已创建「{name}」，并添加了首个账号', { name: name.trim() }))
      onCreated()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(open: boolean) => {
      if (!open && !busy) onClose()
    }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('新建自定义提供商')}</SheetTitle>
        </SheetHeader>

        <SheetBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 11.5, color: 'var(--m-text-3)', lineHeight: 1.6 }}>
              {t('用于接入不在内置清单里的上游（自建中转、公司内网网关等）。建好会同时落一条账号，可以直接开始转发。')}
            </p>

            <div>
              <Label htmlFor='cp-name'>{t('名称')}</Label>
              <Input
                id='cp-name'
                value={name}
                placeholder={t('例如：公司中转')}
                onChange={event => setName(event.currentTarget.value)}
              />
            </div>

            <div>
              <Label>{t('协议')}</Label>
              <Select value={protocol} onValueChange={(value: string | null) => setProtocol(value || 'chat_completions')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROTOCOLS.map(item => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p style={{ fontSize: 11, color: 'var(--m-text-3)', marginTop: 5 }}>{t(hint)}</p>
            </div>

            <div>
              <Label htmlFor='cp-url'>{t('Base URL')}</Label>
              <Input
                id='cp-url'
                value={baseUrl}
                inputMode='url'
                autoComplete='off'
                placeholder={t('https://api.example.com/v1')}
                onChange={event => setBaseUrl(event.currentTarget.value)}
              />
            </div>

            <div>
              <Label htmlFor='cp-key'>{t('API Key（可留空）')}</Label>
              <Input
                id='cp-key'
                value={apiKey}
                type='password'
                autoComplete='new-password'
                placeholder={t('填了会直接写进刚建好的账号')}
                onChange={event => setApiKey(event.currentTarget.value)}
              />
            </div>

            {error ? <ErrorNote text={error} /> : null}
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant='outline' disabled={busy} onClick={onClose}>{t('取消')}</Button>
          <Button disabled={busy || !ready} onClick={() => void save()}>
            {busy ? t('创建中…') : t('创建')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
