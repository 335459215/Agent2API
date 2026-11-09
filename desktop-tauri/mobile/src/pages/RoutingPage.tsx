/**
 * 自定义路由组 —— 手机端补齐的桌面端独有页面。
 *
 * ── 它是什么 ────────────────────────────────────────────────
 * 把多家 provider / 多个模型组合成**一个对外的模型 ID**。调用方只需写
 * `model: "my-group"`，网关按组内策略选账号、失败自动后备。典型场景是
 * 「同一条请求先在便宜账号试，失败再切到贵的」。
 *
 * ── 为什么不做成桌面端那样的三栏画布 ────────────────────────
 * 桌面端是三栏（配置列表 / 当前配置 / 账号组）+ 拖拽排序。手机宽度不够
 * 同时看三栏，拖拽在触屏上还容易误触。这里改成**列表 + 编辑视图**：
 * 看组、改名字与模型 ID、选策略、增删成员。够用，且不会因为控件太小改错。
 *
 * ── 协议 ────────────────────────────────────────────────────
 * GET  /api/routing/groups  → { groups:[{group,revision}], newRevision, catalog }
 * PUT  /api/routing/groups  → body { id, group|null, revision }
 * `revision` 是乐观锁：并发修改会 409，界面要提示重新进入。
 * 删除用 `group: null`（没有 DELETE 端点）。
 */
import { useEffect, useState } from 'react'
import {
  Card,
  Button,
  Input,
  MultiSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch as UiSwitch,
  confirmDialog,
} from '@ui'
import { PageIntro, SectionHead, ErrorNote, Empty } from '../components/ui'
import { t } from '../i18n'
import { apiCall } from '../api/client'
import { accountName } from '../lib/format'
import { store, useStore } from '../state/store'

type Member = {
  id: string
  provider: string
  model: string
  included: boolean
  accounts: string[]
}

type RoutingGroup = {
  id: string
  name: string
  model: string
  description: string
  strategy: string
  sticky: string
  members: Member[]
}

type CatalogEntry = {
  provider: string
  providerLabel: string
  model: string
  name: string
  accountCount: number
}

type GroupsPayload = {
  groups: Array<{ group: RoutingGroup; revision: string }>
  newRevision: string
  catalog: CatalogEntry[]
}

const fetchGroups = () => apiCall<GroupsPayload>('/api/routing/groups')

const putGroup = (id: string, group: RoutingGroup | null, revision: string) =>
  apiCall<GroupsPayload>('/api/routing/groups', {
    method: 'PUT',
    body: { id, group, revision },
  })

/**
 * 路由策略。id 必须与后端 `ROUTING_STRATEGY_*` 常量逐字一致
 * （server/config/types.rs）：
 *   order    按成员顺序，前面的都失败才轮到后面
 *   rotate   在成员之间轮换，摊平用量
 *   provider 同 provider 的成员聚在一起用，减少跨家跳转
 */
const STRATEGIES: Array<{ id: string; label: string }> = [
  { id: 'order', label: t('按顺序') },
  { id: 'rotate', label: t('轮换') },
  { id: 'provider', label: t('按提供商') },
]

/**
 * 会话粘性（`STICKY_*`）：
 *   off     不粘，每次请求都可能换账号
 *   turn    一轮对话内粘住
 *   session 整个会话粘住，最不容易触发风控
 */
const STICKY: Array<{ id: string; label: string }> = [
  { id: 'off', label: t('关闭') },
  { id: 'turn', label: t('按轮次') },
  { id: 'session', label: t('按会话') },
]

const messageOf = (failure: unknown): string =>
  failure instanceof Error ? failure.message : String(failure)

function emptyGroup(): RoutingGroup {
  return {
    id: '',
    name: '',
    model: '',
    description: '',
    strategy: 'order',
    sticky: 'off',
    members: [],
  }
}

export function RoutingPage() {
  const [data, setData] = useState<GroupsPayload | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<RoutingGroup | null>(null)
  const [editingRevision, setEditingRevision] = useState('')
  /** 成员编辑要按 provider 列账号；账号来自当前会话快照，登录后自动刷新。 */
  const accounts = useStore().session?.accounts?.accounts || []

  const load = async () => {
    try {
      setData(await fetchGroups())
      setError('')
    } catch (failure) {
      setError(messageOf(failure))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const beginCreate = () => {
    const draft = emptyGroup()
    draft.id = `group-${Date.now().toString(36)}`
    setEditing(draft)
    setEditingRevision(data?.newRevision ?? '')
  }

  const beginEdit = (group: RoutingGroup, revision: string) => {
    setEditing({
      ...group,
      members: group.members.map(m => ({ ...m, accounts: [...m.accounts] })),
    })
    setEditingRevision(revision)
  }

  const commit = async () => {
    if (!editing) return
    if (!editing.name.trim()) {
      store.toast(t('组名不能为空'), 'warn')
      return
    }
    if (!editing.model.trim()) {
      store.toast(t('对外模型 ID 不能为空'), 'warn')
      return
    }
    const incomplete = editing.members.find(
      member => member.included && (!member.provider || !member.model || member.accounts.length === 0),
    )
    if (incomplete) {
      store.toast(
        t('第 {n} 个成员还没选全提供商、模型或参与账号', { n: editing.members.indexOf(incomplete) + 1 }),
        'warn',
      )
      return
    }
    setBusy(true)
    try {
      const next = await putGroup(editing.id, editing, editingRevision)
      setData(next)
      setEditing(null)
      store.toast(t('已保存'))
    } catch (failure) {
      const message = messageOf(failure)
      store.toast(
        message.includes('revision') || message.includes('冲突') || message.includes('改动')
          ? t('配置已被其他地方改动，请返回列表重新进入')
          : t('保存失败：{msg}', { msg: message }),
        'err',
      )
    } finally {
      setBusy(false)
    }
  }

  const remove = async (group: RoutingGroup, revision: string) => {
    const ok = await confirmDialog(
      t('「{name}」删除后，用这个模型 ID 的调用会失败。', { name: group.name }),
      { title: t('删除路由组'), confirmText: t('删除'), destructive: true },
    )
    if (!ok) return
    setBusy(true)
    try {
      setData(await putGroup(group.id, null, revision))
      store.toast(t('已删除'))
    } catch (failure) {
      store.toast(t('删除失败：{msg}', { msg: messageOf(failure) }), 'err')
    } finally {
      setBusy(false)
    }
  }

  // ── 编辑视图 ───────────────────────────────────────────────
  if (editing) {
    const patch = (next: Partial<RoutingGroup>) => setEditing({ ...editing, ...next })
    const catalog = data?.catalog || []
    /** provider 去重：按账号数量排序，没账号的 provider 只在成员已经引用时保留。 */
    const providerOptions: Array<{ provider: string; label: string; accountCount: number }> = []
    const knownProviders = new Set<string>()
    for (const item of catalog) {
      if (knownProviders.has(item.provider)) continue
      knownProviders.add(item.provider)
      providerOptions.push({
        provider: item.provider,
        label: item.providerLabel || item.provider,
        accountCount: item.accountCount || 0,
      })
    }
    for (const member of editing.members) {
      if (member.provider && !knownProviders.has(member.provider)) {
        knownProviders.add(member.provider)
        providerOptions.push({
          provider: member.provider,
          label: member.provider,
          accountCount: accounts.filter(account => (account.provider || '') === member.provider).length,
        })
      }
    }
    const providers = providerOptions
      .filter(item => item.accountCount > 0 || editing.members.some(member => member.provider === item.provider))
      .sort((a, b) => b.accountCount - a.accountCount || a.label.localeCompare(b.label))
    const accountsOf = (provider: string) => accounts.filter(account => (account.provider || '') === provider)
    const accountOptions = (provider: string) =>
      accountsOf(provider).map(account => ({
        value: account.id,
        label: `${accountName(account)}${account.enabled === false ? t('（已停用）') : ''}`,
      }))
    const updateMember = (index: number, next: Partial<Member>) => {
      patch({ members: editing.members.map((member, i) => (i === index ? { ...member, ...next } : member)) })
    }
    /** 组成员按顺序尝试（order 策略），所以手机上也要能上下挪。 */
    const moveMember = (index: number, delta: number) => {
      const target = index + delta
      if (target < 0 || target >= editing.members.length) return
      const next = [...editing.members]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      patch({ members: next })
    }
    /** 换 provider 时重置模型与账号：模型取该家第一个，账号默认选所有可用账号。 */
    const changeProvider = (index: number, provider: string) => {
      const models = catalog.filter(item => item.provider === provider)
      updateMember(index, {
        provider,
        model: models[0]?.model || '',
        accounts: accountsOf(provider).filter(account => account.enabled !== false).map(account => account.id),
      })
    }
    const addMember = () => {
      const preferred = providers.find(item => item.accountCount > 0)
      const provider = preferred?.provider || ''
      const models = catalog.filter(item => item.provider === provider)
      patch({
        members: [
          ...editing.members,
          {
            id: `member-${Date.now().toString(36)}`,
            provider,
            model: models[0]?.model || '',
            included: true,
            accounts: accountsOf(provider).filter(account => account.enabled !== false).map(account => account.id),
          },
        ],
      })
    }
    return (
      <>
        <PageIntro subtitle={t('改完点保存；返回不保存')} />

        <div className='m-section'>
          <SectionHead title={t('基本信息')} />
          <Card className='m-card'>
            <div className='m-row'>
              <span className='m-grow m-t1'>{t('组名')}</span>
              <Input
                value={editing.name}
                onChange={e => patch({ name: e.target.value })}
                placeholder={t('给这个组合起个名字')}
                style={{ width: 180, textAlign: 'right' }}
              />
            </div>
            <div className='m-row'>
              <div className='m-grow'>
                <div className='m-t1'>{t('对外模型 ID')}</div>
                <div className='m-t2'>{t('调用时 model 写这个值')}</div>
              </div>
              <Input
                value={editing.model}
                onChange={e => patch({ model: e.target.value.trim() })}
                placeholder='my-group'
                style={{ width: 150, textAlign: 'right' }}
              />
            </div>
            <div className='m-row'>
              <span className='m-grow m-t1'>{t('说明')}</span>
              <Input
                value={editing.description}
                onChange={e => patch({ description: e.target.value })}
                placeholder={t('可留空')}
                style={{ width: 180, textAlign: 'right' }}
              />
            </div>
          </Card>
        </div>

        <div className='m-section'>
          <SectionHead title={t('策略')} />
          <Card className='m-card'>
            <div className='m-row'>
              <div className='m-grow'>
                <div className='m-t1'>{t('选号方式')}</div>
                <div className='m-t2'>{t('组内多个成员时按这个方式挑')}</div>
              </div>
            </div>
            <div className='m-row' style={{ gap: 8, flexWrap: 'wrap' }}>
              {STRATEGIES.map(item => (
                <Button
                  key={item.id}
                  size='sm'
                  variant={editing.strategy === item.id ? 'default' : 'outline'}
                  onClick={() => patch({ strategy: item.id })}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <div className='m-row'>
              <div className='m-grow'>
                <div className='m-t1'>{t('粘性会话')}</div>
                <div className='m-t2'>{t('让同一会话尽量落回同一账号，减少换号')}</div>
              </div>
            </div>
            <div className='m-row' style={{ gap: 8, flexWrap: 'wrap' }}>
              {STICKY.map(item => (
                <Button
                  key={item.id}
                  size='sm'
                  variant={editing.sticky === item.id ? 'default' : 'outline'}
                  onClick={() => patch({ sticky: item.id })}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </Card>
        </div>

        <div className='m-section'>
          <SectionHead title={t('成员')} />
          <Card className='m-card'>
            {editing.members.length === 0 ? (
              <div className='m-row m-t2'>
                {t('还没有成员。没有可用的上游时这个组无法工作。')}
              </div>
            ) : null}
            {editing.members.map((member, index) => {
              const models = catalog.filter(item => item.provider === member.provider)
              const currentModelListed = models.some(item => item.model === member.model)
              const providerAccounts = accountsOf(member.provider)
              return (
                <div
                  key={member.id || index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    marginTop: index ? 12 : 0,
                    padding: 12,
                    border: '1px solid var(--m-line)',
                    borderRadius: 'var(--m-r-md)',
                    background: 'var(--m-surface-2)',
                  }}
                >
                  <div className='m-row'>
                    <div className='m-grow'>
                      <div className='m-t1'>{t('成员 {n}', { n: index + 1 })}</div>
                      <div className='m-t2'>
                        {providers.find(item => item.provider === member.provider)?.label || member.provider || t('未选提供商')}
                        {' / '}
                        {member.model || t('未选模型')}
                      </div>
                    </div>
                    <Button
                      size='sm'
                      variant='ghost'
                      disabled={index === 0}
                      aria-label={t('上移')}
                      onClick={() => moveMember(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      disabled={index === editing.members.length - 1}
                      aria-label={t('下移')}
                      onClick={() => moveMember(index, 1)}
                    >
                      ↓
                    </Button>
                    <UiSwitch
                      size='touch'
                      variant='success'
                      checked={member.included}
                      onCheckedChange={next => updateMember(index, { included: next })}
                      aria-label={t('启用该成员')}
                    />
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => patch({ members: editing.members.filter((_, i) => i !== index) })}
                    >
                      {t('移除')}
                    </Button>
                  </div>
                  <div>
                    <div className='m-t2' style={{ marginBottom: 4 }}>{t('提供商')}</div>
                    <Select value={member.provider} onValueChange={value => value && changeProvider(index, String(value))}>
                      <SelectTrigger className='w-full' aria-label={t('提供商')}>
                        <SelectValue placeholder={t('选择提供商')} />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map(item => (
                          <SelectItem key={item.provider} value={item.provider}>
                            {item.label} · {t('{n} 个账号', { n: item.accountCount })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className='m-t2' style={{ marginBottom: 4 }}>{t('模型')}</div>
                    <Select value={member.model} onValueChange={value => value && updateMember(index, { model: String(value) })}>
                      <SelectTrigger className='w-full' aria-label={t('模型')}>
                        <SelectValue placeholder={t('选择模型')} />
                      </SelectTrigger>
                      <SelectContent>
                        {member.model && !currentModelListed ? (
                          <SelectItem value={member.model}>{member.model}</SelectItem>
                        ) : null}
                        {models.map(item => (
                          <SelectItem key={`${item.provider}/${item.model}`} value={item.model}>
                            {item.name && item.name !== item.model ? `${item.name} · ${item.model}` : item.model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className='m-t2' style={{ marginBottom: 4 }}>{t('参与账号')}</div>
                    <MultiSelect
                      value={member.accounts}
                      onValueChange={values => updateMember(index, { accounts: values })}
                      options={[
                        ...accountOptions(member.provider),
                        ...member.accounts
                          .filter(id => !providerAccounts.some(account => account.id === id))
                          .map(id => ({ value: id, label: `${id}${t('（账号已不存在）')}` })),
                      ]}
                      placeholder={providerAccounts.length ? t('选择参与账号') : t('该提供商下没有账号')}
                      searchPlaceholder={t('搜索账号…')}
                      aria-label={t('参与账号')}
                    />
                    {providerAccounts.length === 0 ? (
                      <div className='m-t2' style={{ marginTop: 4 }}>
                        {t('先到「账号」页添加该提供商的账号，成员才能参与路由。')}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
            <div className='m-row'>
              <Button size='sm' variant='outline' onClick={addMember}>
                {t('添加成员')}
              </Button>
            </div>
            <div className='m-row m-t2'>
              {t('成员按列表顺序参与路由，可在这里选提供商、模型和参与账号；拖拽排序仍以桌面端为准。')}
            </div>
          </Card>
        </div>

        <div className='m-section' style={{ display: 'flex', gap: 10 }}>
          <Button variant='outline' disabled={busy} onClick={() => setEditing(null)} className='m-grow'>
            {t('取消')}
          </Button>
          <Button disabled={busy} onClick={commit} className='m-grow'>
            {busy ? t('保存中…') : t('保存')}
          </Button>
        </div>
      </>
    )
  }

  // ── 列表视图 ───────────────────────────────────────────────
  const groups = data?.groups ?? []
  return (
    <>
      <PageIntro subtitle={t('把多个 provider 组合成一个对外模型 ID')} />

      <div className='m-section'>
        <SectionHead
          title={t('已配置的组')}
          action={{ label: t('新建'), onClick: beginCreate }}
        />
        <Card className='m-card'>
          {!data && !error ? <div className='m-row m-t2'>{t('读取中…')}</div> : null}
          {error ? (
            <div className='m-row'>
              <ErrorNote text={error} />
            </div>
          ) : null}
          {data && groups.length === 0 ? (
            <Empty text={t('还没有路由组。新建一个，把多个 provider 组合成一个模型 ID。')} />
          ) : null}
          {groups.map(item => (
            <div className='m-row' key={item.group.id}>
              <div className='m-grow'>
                <div className='m-t1'>{item.group.name}</div>
                <div className='m-t2'>
                  {item.group.model} ·{' '}
                  {t('{n} 个成员', { n: String(item.group.members.filter(m => m.included).length) })}
                </div>
              </div>
              <Button size='sm' variant='outline' onClick={() => beginEdit(item.group, item.revision)}>
                {t('编辑')}
              </Button>
              <Button size='sm' variant='ghost' disabled={busy} onClick={() => remove(item.group, item.revision)}>
                {t('删除')}
              </Button>
            </div>
          ))}
        </Card>
      </div>
    </>
  )
}
