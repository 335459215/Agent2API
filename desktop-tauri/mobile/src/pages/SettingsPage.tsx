import { useState } from 'react'
import { PageIntro, SectionHead, IconButton } from '../components/ui'
import { Icon } from '../components/Icon'
import { ThemeSwitch } from './MorePage'
import { store, useStore } from '../state/store'
import { locale, localeOptions, setLocale } from '../i18n'
import { storeApiKey } from '../api/client'
import { APP_VERSION } from '../lib/appUpdate'
import { SystemInfoSheet } from '../components/SystemInfoSheet'
import { apiBase, baseLabel, serverIdentity } from '../lib/servers'
import { usePullToRefresh, PullIndicator } from '../components/PullToRefresh'
import { t } from '../i18n'
import { Card, Button, Badge, BadgeDot, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle } from '@ui'
import { ClientIdentificationPanel } from '../../../ui-shared/client-identification-panel'
import { clientIdentificationApi } from '../api/client-identification'
import { AdvancedSettingsSections } from '../components/AdvancedSettingsSections'

/**
 * 设置。
 *
 * ── 手机上只放「改了就生效、且不需要复杂表单」的项 ────────────
 * 桌面端设置页有 11 个分类、几十个字段。手机上保留：
 *   · 外观与语言（纯前端偏好）
 *   · 网关地址（复制给客户端）
 *   · 关于与安装（PWA 安装引导、版本）
 * 端口、路由、重试、超时、数据保留这些需要看文档才能填对的，一律留在桌面端
 * —— 摆出来只会让人误改。
 */
export function SettingsPage() {
  const { session, packaged } = useStore()
  const [systemInfo, setSystemInfo] = useState(false)
  const [clientIdentification, setClientIdentification] = useState(false)
  const currentLocale = locale()
  const options = localeOptions()

  // 本页没有自己的列表请求：下拉只需重拉会话（网关状态来自它）
  const pull = usePullToRefresh({ onRefresh: () => store.refresh(true) })

  return (
    <div className='m-page' ref={pull.bindRef}>
      <PullIndicator pull={pull.pull} refreshing={pull.refreshing} />
      <PageIntro subtitle={t('外观 · 接入 · 关于')}
        actions={<IconButton name='refresh' label={t('刷新')} onClick={() => void store.refresh(true)} />}
      />


      {/* 网关状态 */}
      <div className='m-section' style={packaged ? undefined : { marginTop: 0 }}>
        <Card className='m-card'>
          <div className='m-row'>
            <span
              className='m-logo'
              style={{ background: 'var(--m-ok-soft)', borderColor: 'transparent', color: 'var(--m-ok)' }}
            >
              <Icon name='bolt' />
            </span>
            <div className='m-grow'>
              <div className='m-t1'>{session?.health?.upstreamConfigured ? t('网关运行中') : t('上游未配置')}</div>
              <div className='m-t2 m-mono' style={{ fontSize: 11.5 }}>
                {baseLabel(apiBase())}
              </div>
            </div>
            <Badge variant={session?.health?.upstreamConfigured ? 'success' : 'warning'} shape='tag'>
              <BadgeDot />{session?.health?.upstreamConfigured ? t('正常') : t('待配置')}
            </Badge>
          </div>
        </Card>
      </div>

      <div className='m-section'>
        <SectionHead title={t('外观')} />
        <Card className='m-card'>
          <div className='m-row'>
            <span className='m-logo'>
              <Icon name='moon' />
            </span>
            <div className='m-grow'>
              <div className='m-t1'>{t('主题')}</div>
              <div className='m-t2'>{t('跟随系统 · 浅色 · 深色')}</div>
            </div>
            <ThemeSwitch />
          </div>
          <div className='m-row'>
            <span className='m-logo'>
              <Icon name='globe' />
            </span>
            <div className='m-grow'>
              <div className='m-t1'>{t('界面语言')}</div>
              <div className='m-t2'>{options.find(item => item.code === currentLocale)?.label || currentLocale}</div>
            </div>
            <Select value={currentLocale} onValueChange={value => setLocale(String(value))}>
              <SelectTrigger aria-label={t('界面语言')} className='w-auto shrink-0'>
                <SelectValue>{options.find(item => item.code === currentLocale)?.label || currentLocale}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map(item => <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>
      </div>

      <div className='m-section'>
        <SectionHead title={t('接入')} />
        <Card className='m-card'>
          <Button size='default' variant='ghost' type='button' className='m-row h-auto min-h-[52px] w-full justify-start rounded-none border-0 px-3.5 py-3 text-left' onClick={() => setClientIdentification(true)}>
            <span className='m-logo'><Icon name='doc' /></span>
            <div className='m-grow'><div className='m-t1'>{t('客户端识别')}</div><div className='m-t2'>{t('内置识别、自定义规则与来源声明')}</div></div>
            <span className='m-chev'><Icon name='chev' /></span>
          </Button>
          <Button size='default' variant='ghost' type='button' className='m-row h-auto min-h-[52px] w-full justify-start rounded-none border-0 px-3.5 py-3 text-left' onClick={() => store.push('plugins')}>
            <span className='m-logo'><Icon name='plugin' /></span>
            <div className='m-grow'>
              <div className='m-t1'>{t('网关插件')}</div>
              <div className='m-t2'>{t('查看、安装和管理所连接网关的插件')}</div>
            </div>
            <span className='m-chev'><Icon name='chev' /></span>
          </Button>
          <Button size='default' variant='ghost' type='button' className='m-row h-auto min-h-[52px] w-full justify-start rounded-none border-0 px-3.5 py-3 text-left' onClick={() => store.push('keys')}>
            <span className='m-logo'>
              <Icon name='key' />
            </span>
            <div className='m-grow'>
              <div className='m-t1'>{t('网关 Key')}</div>
              <div className='m-t2'>{t('复制给客户端')}</div>
            </div>
            <span className='m-chev'>
              <Icon name='chev' />
            </span>
          </Button>
        </Card>
      </div>

      {/* 高级设置：超时 / 重试 / 排队 / 保留 / 安全。
          这批项原本只在桌面端，理由是「要读文档才填对」；实际用手机管
          常驻网关时，开电脑改一个数字的成本比填错高得多，所以补到这里。 */}
      <AdvancedSettingsSections toast={store.toast} />

      {!packaged && <div className='m-section'>
        <SectionHead title={t('凭证')} />
        <Card className='m-card'>
          <Button size='default' variant='ghost'
            type='button'
            className='m-row h-auto min-h-[52px] w-full justify-start rounded-none border-0 px-3.5 py-3 text-left'
            onClick={() => {
              storeApiKey('')
              store.setAuthLost(null)
              store.toast(t('已清除本机保存的 API Key'))
              void store.refresh(true)
            }}
          >
            <span className='m-logo'>
              <Icon name='logout' />
            </span>
            <div className='m-grow'>
              <div className='m-t1'>{t('清除本机 API Key')}</div>
              <div className='m-t2'>{t('只清掉这个浏览器存的 Key，不影响网关')}</div>
            </div>
            <span className='m-chev'>
              <Icon name='chev' />
            </span>
          </Button>
        </Card>
      </div>}


      <div className='m-section' style={{ paddingBottom: 8 }}>
        <Card className='m-card'>
          {/* 「Agent2API 手机端」这一行点开是版本信息抽屉：本机版本 + 所连网关
              的版本 / 形态 / 系统 / 路径（手机端出问题时第一句要问的就是这些，
              而用户手里只有手机，不该被要求跑回电脑前翻设置页）。
              版本号仍常驻在右侧 —— 一眼能读到的那个数最常用。 */}
          <Button size='default' variant='ghost' type='button' className='m-row h-auto min-h-[52px] w-full justify-start rounded-none border-0 px-3.5 py-3 text-left' onClick={() => setSystemInfo(true)}>
            <span className='m-logo'>
              <Icon name='info' />
            </span>
            <div className='m-grow'>
              <div className='m-t1'>{t('Agent2API 手机端')}</div>
              <div className='m-t2'>{t('版本信息 · 所连网关环境')}</div>
            </div>
            {/* 版本号常驻：排查问题时第一句就要问「你装的哪版」 */}
            <span className='m-mono' style={{ flex: 'none', fontSize: 11.5, color: 'var(--m-text-3)' }}>
              v{APP_VERSION}
            </span>
            <span className='m-chev'>
              <Icon name='chev' />
            </span>
          </Button>
        </Card>
      </div>

      <Sheet open={clientIdentification} onOpenChange={setClientIdentification}>
        <SheetContent><SheetHeader><SheetTitle>{t('客户端识别')}</SheetTitle></SheetHeader><SheetBody>
          {clientIdentification ? <ClientIdentificationPanel key={serverIdentity()} api={clientIdentificationApi} t={t} /> : null}
        </SheetBody></SheetContent>
      </Sheet>
      <SystemInfoSheet open={systemInfo} onClose={() => setSystemInfo(false)} />
    </div>
  )
}

