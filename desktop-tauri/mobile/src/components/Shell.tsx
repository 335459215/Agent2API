import { useEffect, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { useStore, store } from '../state/store'
import { isRateLimited } from '../lib/format'
import { t } from '../i18n'
import { BottomNavigation, BottomNavigationItem, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, StatusDot, Toaster, createToastManager } from '@ui'

const feedbackManager = createToastManager()

/**
 * 应用外壳：页面容器 + 底部标签栏 + 轻提示 + 凭证缺失层。
 *
 * ── 标签栏的显示规则 ─────────────────────────────────────────
 * 一级页显示，二级页隐藏（把高度让给内容）。
 */

export type TabDef = { id: string; label: string; icon: IconName }

const TABS: TabDef[] = [
  { id: 'home', label: t('首页'), icon: 'home' },
  { id: 'report', label: t('报表'), icon: 'chart' },
  { id: 'accounts', label: t('账号'), icon: 'users' },
  { id: 'more', label: t('更多'), icon: 'grid' },
]

/** 一级页集合：这些 screen 显示底部标签栏 */
export const PRIMARY_SCREENS = new Set(TABS.map(tab => tab.id))

/**
 * 软键盘是否弹起。
 *
 * ── 为什么需要这个判断 ────────────────────────────────────────
 * Android 的 `adjustResize` 会让 WebView 随键盘一起缩小，标签栏是 flex 布局
 * 的最后一个子项，于是它被顶到键盘正上方 —— 用户看到的是「输入框 + 一条
 * 导航栏 + 键盘」，而他要的是「输入框 + 键盘」。聊天类应用的通行做法就是
 * 键盘弹起时把标签栏收起来（WhatsApp / Telegram 都是这样）。
 *
 * ── 怎么判 ────────────────────────────────────────────────────
 * `visualViewport` 的高度比 `innerHeight` 小出一大截（> 120px）就是键盘在
 * 占位。阈值取 120 而不是 0：移动浏览器的地址栏收起 / 展开也会让两者差几十
 * 像素，那是正常滚动，不该把标签栏闪一下。
 *
 * 没有 `visualViewport` 的老 WebView 直接返回 false —— 标签栏常驻，行为与
 * 改动前一致，不会因为拿不到 API 就少一条导航。
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const threshold = 120
    const check = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop
      setOpen(covered > threshold)
    }
    viewport.addEventListener('resize', check)
    viewport.addEventListener('scroll', check)
    check()
    return () => {
      viewport.removeEventListener('resize', check)
      viewport.removeEventListener('scroll', check)
    }
  }, [])

  return open
}

export function TabBar() {
  const state = useStore()
  const keyboardOpen = useKeyboardOpen()
  const active = state.stack.length === 0 ? state.route.screen : ''
  if (!PRIMARY_SCREENS.has(state.route.screen) || state.stack.length > 0) return null
  // 键盘弹起时让位：那一条高度留给输入框，而不是导航
  if (keyboardOpen) return null
  const limited = state.session?.accounts?.accounts?.filter(a => a.enabled && isRateLimited(a)).length || 0
  return (
    <BottomNavigation className='m-tabbar' aria-label={t('主导航')}>
      {TABS.map(tab => (
        <BottomNavigationItem
          key={tab.id}
          active={active === tab.id}
          className='m-tab'
          onClick={() => store.go(tab.id)}
        >
          <Icon name={tab.icon} />
          <span>{tab.label}</span>
          {tab.id === 'more' && limited > 0 ? <StatusDot variant='destructive' className='m-dot' /> : null}
        </BottomNavigationItem>
      ))}
    </BottomNavigation>
  )
}

/** 轻提示 */
export function Toast() {
  const { toast } = useStore()
  useEffect(() => {
    if (toast) feedbackManager.add({ id: 'mobile-feedback', title: toast.text, type: toast.tone === 'err' ? 'error' : toast.tone === 'warn' ? 'warning' : 'success', timeout: 3500 })
  }, [toast])
  return <Toaster manager={feedbackManager} position='bottom-center' />
}

/**
 * 凭证缺失层。
 *
 * 本机内嵌模式不再有账号密码登录，唯一可能的凭证缺口是网关 API Key：
 * 就地输入并保存到 localStorage，不跳任何服务端登录页。
 */
export function AuthGate() {
  const state = useStore()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  if (!state.authLost) return null

  const submit = async () => {
    const value = key.trim()
    if (!value) return
    setBusy(true)
    const { storeApiKey } = await import('../api/client')
    storeApiKey(value)
    store.setAuthLost(null)
    await store.refresh(true)
    setBusy(false)
  }

  return <Dialog open disablePointerDismissal>
    <DialogContent className='w-[min(340px,calc(100vw-40px))]' showCloseButton={false}>
      <DialogHeader><DialogTitle>{t('需要网关 API Key')}</DialogTitle></DialogHeader>
      <DialogBody>
        <p className='text-[12.5px] leading-relaxed text-subtle'>{t('这台网关已经设了 API Key。粘贴一把已启用的 Key 继续（可在任意已登录客户端的「网关 Key」页新建）。')}</p>
        <Input type='password' value={key} onChange={event => setKey(event.target.value)} placeholder='sk-…' autoComplete='off' />
      </DialogBody>
      <DialogFooter>
        <Button size='touch' className='w-full' onClick={() => void submit()} disabled={busy || !key.trim()}>{busy ? t('验证中…') : t('保存并继续')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

/**
 * 主题同步：把 store 的主题写到 <html>。
 *
 * 单独一个组件而不是在 store 构造时做，是为了让 React 的首帧与 DOM 属性
 * 一致 —— 首帧闪烁（先浅色再切深色）在手机上是可见的。
 */
export function ThemeSync() {
  const { theme } = useStore()
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return null
}
