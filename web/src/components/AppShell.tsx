import type { ReactNode } from 'react'
import {
  AudioLines,
  Heart,
  History,
  Library,
  ListMusic,
  ListPlus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from 'lucide-react'
import type { ViewMode } from '../App'

export function AppShell({
  children,
  view,
  topbarTitle,
  librarySummary,
  backendStatus,
  isBackendOffline,
  query,
  isNavigationCollapsed,
  onViewChange,
  onSearchChange,
  onClearSearch,
  onToggleNavigation,
}: {
  children: ReactNode
  view: ViewMode
  topbarTitle: string
  librarySummary: string
  backendStatus: string
  isBackendOffline: boolean
  query: string
  isNavigationCollapsed: boolean
  onViewChange: (view: ViewMode) => void
  onSearchChange: (value: string) => void
  onClearSearch: () => void
  onToggleNavigation: () => void
}) {
  return (
    <div className={`app-shell ${isNavigationCollapsed ? 'nav-collapsed' : 'nav-expanded'}`}>
      <ProductNavigation
        view={view}
        isCollapsed={isNavigationCollapsed}
        onViewChange={onViewChange}
        onToggleNavigation={onToggleNavigation}
      />

      <main className="workspace">
        <TopBar
          title={topbarTitle}
          librarySummary={librarySummary}
          backendStatus={backendStatus}
          isBackendOffline={isBackendOffline}
          query={query}
          onSearchChange={onSearchChange}
          onClearSearch={onClearSearch}
        />
        {children}
      </main>
    </div>
  )
}

function ProductNavigation({
  view,
  isCollapsed,
  onViewChange,
  onToggleNavigation,
}: {
  view: ViewMode
  isCollapsed: boolean
  onViewChange: (view: ViewMode) => void
  onToggleNavigation: () => void
}) {
  return (
    <aside className="sidebar" aria-label="主导航">
      <div className="sidebar-brand">
        <div className="brand-mark" title="聆听">
          <AudioLines size={24} strokeWidth={2.2} />
        </div>
        <strong>聆听</strong>
      </div>

      <button
        type="button"
        className="nav-collapse-button"
        aria-label={isCollapsed ? '展开导航' : '收起导航'}
        aria-expanded={!isCollapsed}
        onClick={onToggleNavigation}
      >
        {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        <span>{isCollapsed ? '展开' : '收起'}</span>
      </button>

      <nav className="nav-list">
        <NavItem icon={<ListMusic size={20} />} label="歌曲" active={view === 'songs'} onClick={() => onViewChange('songs')} />
        <NavItem icon={<ListPlus size={20} />} label="歌单" active={view === 'playlists'} onClick={() => onViewChange('playlists')} />
        <NavItem icon={<Heart size={20} />} label="我喜欢" active={view === 'liked'} onClick={() => onViewChange('liked')} />
        <NavItem icon={<History size={20} />} label="最近播放" active={view === 'recent'} onClick={() => onViewChange('recent')} />
        <NavItem icon={<Library size={20} />} label="媒体库" active={view === 'libraries'} onClick={() => onViewChange('libraries')} />
      </nav>
    </aside>
  )
}

function TopBar({
  title,
  librarySummary,
  backendStatus,
  isBackendOffline,
  query,
  onSearchChange,
  onClearSearch,
}: {
  title: string
  librarySummary: string
  backendStatus: string
  isBackendOffline: boolean
  query: string
  onSearchChange: (value: string) => void
  onClearSearch: () => void
}) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        <p>
          {librarySummary}
          <span className={`connection-dot ${isBackendOffline ? 'offline' : 'online'}`}>{backendStatus}</span>
        </p>
      </div>

      <label className="search-box">
        <Search size={18} />
        <input value={query} onChange={(event) => onSearchChange(event.target.value)} placeholder="全库搜索标题、艺术家或专辑" />
        {query && (
          <button type="button" aria-label="清空搜索" onClick={onClearSearch}>
            <X size={16} />
          </button>
        )}
      </label>
    </header>
  )
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} type="button" aria-label={label} title={label} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
}
