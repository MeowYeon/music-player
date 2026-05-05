import { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AudioLines,
  CheckCircle2,
  Clock3,
  FolderOpen,
  Heart,
  History,
  Library,
  ListMusic,
  ListPlus,
  Pause,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  RefreshCw,
  Search,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  X,
  XCircle,
} from 'lucide-react'
import {
  createPlaylist,
  createLibrary,
  deleteLibrary,
  deletePlaylist,
  getActiveScanTasks,
  getLibraries,
  getLibrarySummary,
  getLikedTracks,
  getPlaylistTracks,
  getPlaylists,
  getRecentTracks,
  getTracks,
  getTrackStreamUrl,
  renamePlaylist,
  scanLibrary,
  type LibraryItem,
  type Playlist,
  type ScanStatus,
  type ScanTask,
  type Track,
} from './api'

const defaultLibraryPath = '/mnt/c/Users/guohp/Music/test'
type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'
type ViewMode = 'libraries' | 'songs' | 'playlists' | 'liked' | 'recent'

function App() {
  const queryClient = useQueryClient()
  const audioRef = useRef<HTMLAudioElement>(null)
  const previousActiveCountRef = useRef(0)
  const [view, setView] = useState<ViewMode>('libraries')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const [libraryQueryText, setLibraryQueryText] = useState('')
  const [playlistName, setPlaylistName] = useState('')
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null)
  const [libraryPath, setLibraryPath] = useState(defaultLibraryPath)
  const [libraryFormError, setLibraryFormError] = useState('')
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle')
  const [playerError, setPlayerError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(72)
  const [isVolumeOpen, setIsVolumeOpen] = useState(false)

  const librarySummaryQuery = useQuery({
    queryKey: ['library'],
    queryFn: getLibrarySummary,
    refetchInterval: 5000,
  })

  const tracksQuery = useQuery({
    queryKey: ['tracks', query],
    queryFn: () => getTracks(query),
    refetchInterval: 15000,
  })

  const librariesQuery = useQuery({
    queryKey: ['libraries'],
    queryFn: getLibraries,
    refetchInterval: 5000,
  })

  const playlistsQuery = useQuery({
    queryKey: ['playlists'],
    queryFn: getPlaylists,
    refetchInterval: 10000,
  })

  const playlistTracksQuery = useQuery({
    queryKey: ['playlist-tracks', selectedPlaylistId],
    queryFn: () => getPlaylistTracks(selectedPlaylistId ?? 0),
    enabled: view === 'playlists' && selectedPlaylistId !== null,
  })

  const likedTracksQuery = useQuery({
    queryKey: ['playlist-tracks', 'liked'],
    queryFn: getLikedTracks,
    enabled: view === 'liked',
    refetchInterval: 15000,
  })

  const recentTracksQuery = useQuery({
    queryKey: ['playlist-tracks', 'recent'],
    queryFn: getRecentTracks,
    enabled: view === 'recent',
    refetchInterval: 15000,
  })

  const rawLibraries = librariesQuery.data ?? []
  const rawActiveTasks = rawLibraries
    .map((library) => library.scan)
    .filter((scan) => isActiveScan(scan.status))

  const activeScanTasksQuery = useQuery({
    queryKey: ['scan-tasks', 'active'],
    queryFn: getActiveScanTasks,
    enabled: rawActiveTasks.length > 0,
    refetchInterval: (query) => ((query.state.data?.length ?? rawActiveTasks.length) > 0 ? 2000 : false),
  })

  const activeTasks = activeScanTasksQuery.data ?? rawActiveTasks
  const activeTaskByLibrary = useMemo(() => {
    return new Map(activeTasks.map((task) => [task.libraryId, task]))
  }, [activeTasks])

  const libraries = useMemo(() => {
    return rawLibraries.map((library) => ({
      ...library,
      scan: activeTaskByLibrary.get(library.id) ?? library.scan,
    }))
  }, [activeTaskByLibrary, rawLibraries])

  const scanLibraryMutation = useMutation({
    mutationFn: scanLibrary,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] })
      queryClient.invalidateQueries({ queryKey: ['scan-tasks', 'active'] })
    },
  })

  const createLibraryMutation = useMutation({
    mutationFn: createLibrary,
    onSuccess: (library) => {
      setLibraryFormError('')
      setLibraryPath(library.path)
      queryClient.invalidateQueries({ queryKey: ['libraries'] })
      queryClient.invalidateQueries({ queryKey: ['library'] })
      scanLibraryMutation.mutate(library.id)
    },
  })

  const deleteLibraryMutation = useMutation({
    mutationFn: deleteLibrary,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] })
      queryClient.invalidateQueries({ queryKey: ['library'] })
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
      queryClient.invalidateQueries({ queryKey: ['scan-tasks', 'active'] })
    },
  })

  const createPlaylistMutation = useMutation({
    mutationFn: createPlaylist,
    onSuccess: (playlist) => {
      setPlaylistName('')
      setSelectedPlaylistId(playlist.id)
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })

  const renamePlaylistMutation = useMutation({
    mutationFn: ({ playlistId, name }: { playlistId: number; name: string }) => renamePlaylist(playlistId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })

  const deletePlaylistMutation = useMutation({
    mutationFn: deletePlaylist,
    onSuccess: () => {
      setSelectedPlaylistId(null)
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })

  useEffect(() => {
    const activeCount = activeTasks.length
    if (previousActiveCountRef.current > 0 && activeCount === 0) {
      queryClient.invalidateQueries({ queryKey: ['libraries'] })
      queryClient.invalidateQueries({ queryKey: ['library'] })
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
    }
    previousActiveCountRef.current = activeCount
  }, [activeTasks.length, queryClient])

  const tracks = tracksQuery.data ?? []
  const playlists = playlistsQuery.data ?? []
  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null
  const activePlaylistTracks = playlistTracksQuery.data ?? []
  const likedTracks = likedTracksQuery.data ?? []
  const recentTracks = recentTracksQuery.data ?? []

  useEffect(() => {
    if (selectedPlaylistId === null && playlists.length > 0) {
      setSelectedPlaylistId(playlists[0].id)
    }
  }, [playlists, selectedPlaylistId])
  const filteredLibraries = useMemo(() => {
    const normalized = libraryQueryText.trim().toLowerCase()
    if (!normalized) {
      return libraries
    }
    return libraries.filter((library) => library.path.toLowerCase().includes(normalized))
  }, [libraries, libraryQueryText])

  const currentIndex = currentTrack ? tracks.findIndex((track) => track.id === currentTrack.id) : -1
  const canUsePrevious = tracks.length > 0 && currentIndex > 0
  const canUseNext = tracks.length > 0 && currentIndex >= 0 && currentIndex < tracks.length - 1
  const playerDuration = duration || (currentTrack?.durationMs ? currentTrack.durationMs / 1000 : 0)
  const isPlaying = playbackStatus === 'playing'
  const showPauseButton = playbackStatus === 'loading' || playbackStatus === 'playing'
  const librarySummary = `${librarySummaryQuery.data?.rootCount ?? libraries.length} 个媒体库 · ${
    librarySummaryQuery.data?.trackCount ?? tracks.length
  } 首歌曲`
  const backendStatus = librarySummaryQuery.isError ? '后端未连接' : librarySummaryQuery.isFetching ? '同步中' : '已连接'

  function handleLibrarySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const path = libraryPath.trim()
    if (!path) {
      setLibraryFormError('请输入音乐目录路径。')
      return
    }

    setLibraryFormError('')
    createLibraryMutation.mutate({ path })
  }

  function handleScanLibrary(library: LibraryItem) {
    scanLibraryMutation.mutate(library.id)
  }

  function handleDeleteLibrary(library: LibraryItem) {
    const confirmed = window.confirm(
      `确定删除这个媒体库吗？\n\n${library.path}\n\n这会删除媒体库索引、扫描状态和不再被其他媒体库引用的歌曲详情；不会删除本地音乐文件。`,
    )
    if (!confirmed) {
      return
    }

    deleteLibraryMutation.mutate(library.id)
  }

  function handlePlaylistSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = playlistName.trim()
    if (!name) {
      return
    }
    createPlaylistMutation.mutate(name)
  }

  function handleRenamePlaylist(playlist: Playlist) {
    const name = window.prompt('输入新的歌单名称', playlist.name)?.trim()
    if (!name || name === playlist.name) {
      return
    }
    renamePlaylistMutation.mutate({ playlistId: playlist.id, name })
  }

  function handleDeletePlaylist(playlist: Playlist) {
    const confirmed = window.confirm(`确定删除歌单「${playlist.name}」吗？\\n\\n这只会删除歌单，不会删除本地音乐文件。`)
    if (!confirmed) {
      return
    }
    deletePlaylistMutation.mutate(playlist.id)
  }

  function handleSelectTrack(track: Track) {
    setSelectedTrack(track)
    if (currentTrack?.id === track.id && (playbackStatus === 'loading' || playbackStatus === 'playing')) {
      return
    }
    playTrack(track)
  }

  function playTrack(track: Track) {
    setCurrentTrack(track)
    setPlaybackStatus('loading')
    setPlayerError('')
    setCurrentTime(0)
    setDuration(0)

    window.setTimeout(() => {
      audioRef.current?.play().catch(() => {
        setPlaybackStatus('error')
        setPlayerError('播放失败，请确认文件仍然存在且浏览器支持该格式。')
      })
    }, 0)
  }

  function handleTogglePlayback() {
    const track = currentTrack ?? tracks[0]
    if (!track) {
      return
    }
    if (!currentTrack) {
      playTrack(track)
      return
    }

    if (isPlaying) {
      audioRef.current?.pause()
      return
    }

    setPlaybackStatus('loading')
    audioRef.current?.play().then(
      () => setPlaybackStatus('playing'),
      () => {
        setPlaybackStatus('error')
        setPlayerError('播放失败，请稍后重试。')
      },
    )
  }

  function handlePreviousTrack() {
    if (canUsePrevious) {
      playTrack(tracks[currentIndex - 1])
    }
  }

  function handleNextTrack() {
    if (canUseNext) {
      playTrack(tracks[currentIndex + 1])
    }
  }

  function handleSeek(value: number) {
    setCurrentTime(value)
    if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
      audioRef.current.currentTime = value
    }
  }

  function handleVolumeChange(value: number) {
    setVolume(value)
    if (audioRef.current) {
      audioRef.current.volume = value / 100
    }
  }

  const topbarTitle = viewTitle(view)
  const searchValue = view === 'songs' ? query : view === 'libraries' ? libraryQueryText : ''
  const searchPlaceholder = view === 'songs' ? '搜索标题、艺术家或专辑' : view === 'libraries' ? '搜索媒体库路径' : '当前页面暂无搜索'
  const canSearch = view === 'songs' || view === 'libraries'

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar" aria-label="主导航">
        <div className="sidebar-brand">
          <div className="brand-mark" title="阿言">
            <AudioLines size={24} strokeWidth={2.2} />
          </div>
          {!isSidebarCollapsed && <strong>阿言</strong>}
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            title={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="nav-list">
          <NavItem collapsed={isSidebarCollapsed} icon={<Library size={20} />} label="媒体库" active={view === 'libraries'} onClick={() => setView('libraries')} />
          <NavItem collapsed={isSidebarCollapsed} icon={<ListMusic size={20} />} label="歌曲管理" active={view === 'songs'} onClick={() => setView('songs')} />
          <NavItem collapsed={isSidebarCollapsed} icon={<ListPlus size={20} />} label="歌单管理" active={view === 'playlists'} onClick={() => setView('playlists')} />
          <NavItem collapsed={isSidebarCollapsed} icon={<Heart size={20} />} label="我喜欢" active={view === 'liked'} onClick={() => setView('liked')} />
          <NavItem collapsed={isSidebarCollapsed} icon={<History size={20} />} label="最近播放" active={view === 'recent'} onClick={() => setView('recent')} />
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{topbarTitle}</h1>
            <p>
              {librarySummary}
              <span className={`connection-dot ${librarySummaryQuery.isError ? 'offline' : 'online'}`}>
                {backendStatus}
              </span>
            </p>
          </div>

          <label className={`search-box ${canSearch ? '' : 'disabled'}`}>
            <Search size={18} />
            <input
              value={searchValue}
              disabled={!canSearch}
              onChange={(event) => (view === 'songs' ? setQuery(event.target.value) : setLibraryQueryText(event.target.value))}
              placeholder={searchPlaceholder}
            />
            {canSearch && searchValue && (
              <button
                type="button"
                aria-label="清空搜索"
                onClick={() => (view === 'songs' ? setQuery('') : setLibraryQueryText(''))}
              >
                <X size={16} />
              </button>
            )}
          </label>
        </header>

        {view === 'songs' ? (
          <SongsView
            tracks={tracks}
            selectedTrack={selectedTrack}
            currentTrack={currentTrack}
            playbackStatus={playbackStatus}
            playerError={playerError}
            isLoading={tracksQuery.isLoading}
            isError={tracksQuery.isError}
            query={query}
            onSelectTrack={handleSelectTrack}
          />
        ) : view === 'libraries' ? (
          <LibrariesView
            libraries={filteredLibraries}
            libraryPath={libraryPath}
            formError={libraryFormError}
            isCreating={createLibraryMutation.isPending}
            createError={createLibraryMutation.error}
            isScanning={scanLibraryMutation.isPending}
            isDeleting={deleteLibraryMutation.isPending}
            isLoading={librariesQuery.isLoading}
            isError={librariesQuery.isError}
            onPathChange={setLibraryPath}
            onSubmit={handleLibrarySubmit}
            onScan={handleScanLibrary}
            onDelete={handleDeleteLibrary}
          />
        ) : view === 'playlists' ? (
          <PlaylistsView
            playlists={playlists}
            selectedPlaylist={selectedPlaylist}
            tracks={activePlaylistTracks}
            playlistName={playlistName}
            isLoading={playlistsQuery.isLoading || playlistTracksQuery.isLoading}
            isError={playlistsQuery.isError || playlistTracksQuery.isError}
            isCreating={createPlaylistMutation.isPending}
            isMutating={renamePlaylistMutation.isPending || deletePlaylistMutation.isPending}
            selectedTrack={selectedTrack}
            currentTrack={currentTrack}
            playbackStatus={playbackStatus}
            onNameChange={setPlaylistName}
            onSubmit={handlePlaylistSubmit}
            onSelectPlaylist={setSelectedPlaylistId}
            onRenamePlaylist={handleRenamePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            onSelectTrack={handleSelectTrack}
          />
        ) : view === 'liked' ? (
          <SystemPlaylistView
            title="我喜欢"
            body="收藏过的歌曲会固定出现在这里。"
            tracks={likedTracks}
            selectedTrack={selectedTrack}
            currentTrack={currentTrack}
            playbackStatus={playbackStatus}
            isLoading={likedTracksQuery.isLoading}
            isError={likedTracksQuery.isError}
            emptyTitle="还没有喜欢的歌曲"
            emptyBody="在歌曲列表中点亮收藏按钮后，这里会显示它们。"
            onSelectTrack={handleSelectTrack}
          />
        ) : (
          <SystemPlaylistView
            title="最近播放"
            body="歌曲真正开始播放后，会自动更新到这里。"
            tracks={recentTracks}
            selectedTrack={selectedTrack}
            currentTrack={currentTrack}
            playbackStatus={playbackStatus}
            isLoading={recentTracksQuery.isLoading}
            isError={recentTracksQuery.isError}
            emptyTitle="还没有最近播放"
            emptyBody="开始播放任意歌曲后，这里会展示最近听过的内容。"
            onSelectTrack={handleSelectTrack}
          />
        )}
      </main>

      <footer className="player-bar">
        <div className="player-track">
          <div className="track-glyph">
            <AudioLines size={18} />
          </div>
          <div>
            <strong>{currentTrack?.title ?? '未选择歌曲'}</strong>
            <span>{currentTrack ? displayArtist(currentTrack) : '选择歌曲后开始播放'}</span>
          </div>
        </div>

        <div className="player-controls">
          <button type="button" aria-label="上一首" disabled={!canUsePrevious} onClick={handlePreviousTrack} title="上一首">
            <SkipBack size={19} />
          </button>
          <button className="play-button" type="button" aria-label={showPauseButton ? '暂停' : '播放'} onClick={handleTogglePlayback} title={showPauseButton ? '暂停' : '播放'}>
            {showPauseButton ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
          <button type="button" aria-label="下一首" disabled={!canUseNext} onClick={handleNextTrack} title="下一首">
            <SkipForward size={19} />
          </button>
        </div>

        <div className="player-progress">
          <span>{formatDurationSeconds(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={playerDuration || 0}
            step="0.1"
            value={Math.min(currentTime, playerDuration || 0)}
            onChange={(event) => handleSeek(Number(event.target.value))}
            disabled={!currentTrack || !playerDuration}
            aria-label="播放进度"
          />
          <span>{formatDurationSeconds(playerDuration)}</span>
        </div>

        <div className="volume-popover-wrap">
          {isVolumeOpen && (
            <div className="volume-popover">
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(event) => handleVolumeChange(Number(event.target.value))}
                aria-label="音量"
              />
            </div>
          )}
          <button
            type="button"
            className="volume-button"
            aria-label="音量"
            title="音量"
            onClick={() => setIsVolumeOpen((open) => !open)}
          >
            <Volume2 size={18} />
          </button>
        </div>

        <audio
          ref={audioRef}
          src={currentTrack ? getTrackStreamUrl(currentTrack.id) : undefined}
          onLoadStart={() => {
            if (currentTrack) {
              setPlaybackStatus('loading')
              setPlayerError('')
            }
          }}
          onLoadedMetadata={(event) => {
            const nextDuration = event.currentTarget.duration
            setDuration(Number.isFinite(nextDuration) ? nextDuration : 0)
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlaying={() => setPlaybackStatus('playing')}
          onPause={() => setPlaybackStatus((status) => (status === 'ended' || status === 'error' ? status : 'paused'))}
          onWaiting={() => setPlaybackStatus('loading')}
          onEnded={() => {
            setPlaybackStatus('ended')
            setCurrentTime(0)
          }}
          onError={() => {
            setPlaybackStatus('error')
            setPlayerError('播放失败，请确认文件仍然存在且格式受支持。')
          }}
        />
      </footer>
    </div>
  )
}

function NavItem({
  icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  icon: ReactNode
  label: string
  active: boolean
  collapsed: boolean
  onClick: () => void
}) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} type="button" aria-label={label} title={label} onClick={onClick}>
      {icon}
      {!collapsed && <span>{label}</span>}
    </button>
  )
}

function SongsView({
  tracks,
  selectedTrack,
  currentTrack,
  playbackStatus,
  playerError,
  isLoading,
  isError,
  query,
  onSelectTrack,
}: {
  tracks: Track[]
  selectedTrack: Track | null
  currentTrack: Track | null
  playbackStatus: PlaybackStatus
  playerError: string
  isLoading: boolean
  isError: boolean
  query: string
  onSelectTrack: (track: Track) => void
}) {
  return (
    <section className="library-pane" aria-label="歌曲库">
      <div className="now-summary">
        <div>
          <span className="eyebrow">正在播放</span>
          <h2>{currentTrack?.title ?? '未选择歌曲'}</h2>
          <p>{currentTrack ? `${displayArtist(currentTrack)} · ${displayAlbum(currentTrack)} · ${playbackLabel(playbackStatus)}` : '从歌曲列表选择一首开始播放'}</p>
          {playerError && <em className="inline-error">{playerError}</em>}
        </div>
        <div className="passive-wave" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <h3>全部歌曲</h3>
          <span>{tracks.length} 首</span>
        </div>

        <div className="table-scroll">
          <table className="track-table">
            <thead>
              <tr>
                <th>标题</th>
                <th>艺术家</th>
                <th>专辑</th>
                <th>时长</th>
                <th>格式</th>
                <th>路径</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <tr
                  key={track.id}
                  className={trackRowClass(track, selectedTrack, currentTrack, playbackStatus)}
                  onClick={() => onSelectTrack(track)}
                >
                  <td>
                    <button type="button" className="track-title">
                      {track.title}
                    </button>
                  </td>
                  <td className={!track.artist ? 'muted-cell' : undefined}>{displayArtist(track)}</td>
                  <td className={!track.album ? 'muted-cell' : undefined}>{displayAlbum(track)}</td>
                  <td>{formatDuration(track.durationMs)}</td>
                  <td>
                    <span className="format-chip">{track.format}</span>
                  </td>
                  <td className="path-cell">{track.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isLoading && <StateMessage title="正在读取歌曲库" body="稍等一下，阿言正在同步本地媒体库。" />}
        {isError && <StateMessage title="歌曲加载失败" body="请确认后端服务已启动，然后刷新页面或重新扫描。" tone="error" />}
        {!isLoading && !isError && !tracks.length && (
          <StateMessage
            title={query ? '没有匹配的歌曲' : '还没有歌曲'}
            body={query ? '换个关键词试试，或清空搜索查看全部歌曲。' : '添加媒体库并完成扫描后，这里会展示歌曲列表。'}
          />
        )}
      </div>
    </section>
  )
}

function PlaylistsView({
  playlists,
  selectedPlaylist,
  tracks,
  playlistName,
  isLoading,
  isError,
  isCreating,
  isMutating,
  selectedTrack,
  currentTrack,
  playbackStatus,
  onNameChange,
  onSubmit,
  onSelectPlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onSelectTrack,
}: {
  playlists: Playlist[]
  selectedPlaylist: Playlist | null
  tracks: Track[]
  playlistName: string
  isLoading: boolean
  isError: boolean
  isCreating: boolean
  isMutating: boolean
  selectedTrack: Track | null
  currentTrack: Track | null
  playbackStatus: PlaybackStatus
  onNameChange: (name: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onSelectPlaylist: (id: number) => void
  onRenamePlaylist: (playlist: Playlist) => void
  onDeletePlaylist: (playlist: Playlist) => void
  onSelectTrack: (track: Track) => void
}) {
  return (
    <section className="playlist-page" aria-label="歌单管理">
      <aside className="playlist-sidebar">
        <form className="playlist-form" onSubmit={onSubmit}>
          <label htmlFor="playlist-name">新建歌单</label>
          <div>
            <input
              id="playlist-name"
              value={playlistName}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="例如：夜间散步"
              disabled={isCreating}
            />
            <button type="submit" disabled={isCreating || !playlistName.trim()} title="创建歌单" aria-label="创建歌单">
              <Plus size={17} />
            </button>
          </div>
        </form>

        <div className="playlist-list">
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              className={`playlist-item ${selectedPlaylist?.id === playlist.id ? 'active' : ''}`}
              onClick={() => onSelectPlaylist(playlist.id)}
            >
              <span>
                <strong>{playlist.name}</strong>
                <small>{playlist.trackCount} 首歌曲</small>
              </span>
            </button>
          ))}
        </div>

        {!playlists.length && !isLoading && <StateMessage title="还没有普通歌单" body="创建一个歌单后，可以从歌曲行菜单添加歌曲。" />}
      </aside>

      <div className="playlist-detail">
        <div className="table-header">
          <div>
            <h3>{selectedPlaylist?.name ?? '选择一个歌单'}</h3>
            <span>{selectedPlaylist ? `${selectedPlaylist.trackCount} 首歌曲 · 按添加时间排序` : '普通歌单不会包含我喜欢和最近播放'}</span>
          </div>
          {selectedPlaylist && (
            <div className="row-actions">
              <button type="button" onClick={() => onRenamePlaylist(selectedPlaylist)} disabled={isMutating} title="重命名" aria-label="重命名">
                <RefreshCw size={15} />
              </button>
              <button type="button" className="danger" onClick={() => onDeletePlaylist(selectedPlaylist)} disabled={isMutating} title="删除歌单" aria-label="删除歌单">
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </div>

        <PlaylistTrackTable
          tracks={tracks}
          selectedTrack={selectedTrack}
          currentTrack={currentTrack}
          playbackStatus={playbackStatus}
          onSelectTrack={onSelectTrack}
        />

        {isLoading && <StateMessage title="正在读取歌单" body="稍等一下，阿言正在同步歌单数据。" />}
        {isError && <StateMessage title="歌单加载失败" body="请确认后端服务已启动，然后刷新页面。" tone="error" />}
        {selectedPlaylist && !isLoading && !isError && !tracks.length && <StateMessage title="这个歌单还是空的" body="从歌曲列表的三点菜单中添加歌曲到歌单。" />}
      </div>
    </section>
  )
}

function SystemPlaylistView({
  title,
  body,
  tracks,
  selectedTrack,
  currentTrack,
  playbackStatus,
  isLoading,
  isError,
  emptyTitle,
  emptyBody,
  onSelectTrack,
}: {
  title: string
  body: string
  tracks: Track[]
  selectedTrack: Track | null
  currentTrack: Track | null
  playbackStatus: PlaybackStatus
  isLoading: boolean
  isError: boolean
  emptyTitle: string
  emptyBody: string
  onSelectTrack: (track: Track) => void
}) {
  return (
    <section className="system-playlist-page" aria-label={title}>
      <div className="now-summary">
        <div>
          <span className="eyebrow">系统歌单</span>
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        <div className="system-glyph" aria-hidden="true">
          {title === '我喜欢' ? <Heart size={32} /> : <History size={32} />}
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <h3>{title}</h3>
          <span>{tracks.length} 首</span>
        </div>
        <PlaylistTrackTable
          tracks={tracks}
          selectedTrack={selectedTrack}
          currentTrack={currentTrack}
          playbackStatus={playbackStatus}
          onSelectTrack={onSelectTrack}
        />
        {isLoading && <StateMessage title="正在读取歌曲" body="稍等一下，阿言正在同步系统歌单。" />}
        {isError && <StateMessage title="系统歌单加载失败" body="请确认后端服务已启动，然后刷新页面。" tone="error" />}
        {!isLoading && !isError && !tracks.length && <StateMessage title={emptyTitle} body={emptyBody} />}
      </div>
    </section>
  )
}

function PlaylistTrackTable({
  tracks,
  selectedTrack,
  currentTrack,
  playbackStatus,
  onSelectTrack,
}: {
  tracks: Track[]
  selectedTrack: Track | null
  currentTrack: Track | null
  playbackStatus: PlaybackStatus
  onSelectTrack: (track: Track) => void
}) {
  return (
    <div className="table-scroll">
      <table className="track-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>艺术家</th>
            <th>专辑</th>
            <th>时长</th>
            <th>格式</th>
            <th>路径</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track) => (
            <tr key={track.id} className={trackRowClass(track, selectedTrack, currentTrack, playbackStatus)} onClick={() => onSelectTrack(track)}>
              <td>
                <button type="button" className="track-title">
                  {track.title}
                </button>
              </td>
              <td className={!track.artist ? 'muted-cell' : undefined}>{displayArtist(track)}</td>
              <td className={!track.album ? 'muted-cell' : undefined}>{displayAlbum(track)}</td>
              <td>{formatDuration(track.durationMs)}</td>
              <td>
                <span className="format-chip">{track.format}</span>
              </td>
              <td className="path-cell">{track.path}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LibrariesView({
  libraries,
  libraryPath,
  formError,
  createError,
  isCreating,
  isScanning,
  isDeleting,
  isLoading,
  isError,
  onPathChange,
  onSubmit,
  onScan,
  onDelete,
}: {
  libraries: LibraryItem[]
  libraryPath: string
  formError: string
  createError: unknown
  isCreating: boolean
  isScanning: boolean
  isDeleting: boolean
  isLoading: boolean
  isError: boolean
  onPathChange: (path: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onScan: (library: LibraryItem) => void
  onDelete: (library: LibraryItem) => void
}) {
  return (
    <section className="libraries-page" aria-label="媒体库管理">
      <form className="library-toolbar" onSubmit={onSubmit}>
        <label htmlFor="library-path">音乐目录</label>
        <input
          id="library-path"
          value={libraryPath}
          onChange={(event) => onPathChange(event.target.value)}
          placeholder="/home/ghp/Music"
          disabled={isCreating}
        />
        <button className="primary-button" type="submit" disabled={isCreating}>
          <Plus size={17} />
          {isCreating ? '添加中' : '添加媒体库'}
        </button>
        {(formError || Boolean(createError)) && <p className="form-error">{formError || errorMessage(createError, '媒体库添加失败。')}</p>}
      </form>

      <div className="libraries-wrap">
        <div className="table-header">
          <h3>媒体库</h3>
          <span>{libraries.length} 个</span>
        </div>

        <div className="table-scroll">
          <table className="library-table">
            <thead>
              <tr>
                <th>目录</th>
                <th>歌曲数</th>
                <th>扫描状态</th>
                <th>进度</th>
                <th>完成时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {libraries.map((library) => (
                <LibraryRow
                  key={library.id}
                  library={library}
                  isScanning={isScanning}
                  isDeleting={isDeleting}
                  onScan={onScan}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>
        </div>

        {isLoading && <StateMessage title="正在读取媒体库" body="稍等一下，阿言正在同步媒体库目录。" />}
        {isError && <StateMessage title="媒体库加载失败" body="请确认后端服务已启动，然后刷新页面。" tone="error" />}
        {!isLoading && !isError && !libraries.length && (
          <StateMessage title="还没有媒体库" body="添加一个音乐目录后，阿言会自动开始第一次扫描。" />
        )}
      </div>
    </section>
  )
}

function LibraryRow({
  library,
  isScanning,
  isDeleting,
  onScan,
  onDelete,
}: {
  library: LibraryItem
  isScanning: boolean
  isDeleting: boolean
  onScan: (library: LibraryItem) => void
  onDelete: (library: LibraryItem) => void
}) {
  const progress = library.scan.totalFiles > 0 ? Math.round((library.scan.scannedFiles / library.scan.totalFiles) * 100) : 0
  const active = isActiveScan(library.scan.status)
  const Icon = library.scan.status === 'completed' ? CheckCircle2 : library.scan.status === 'failed' ? XCircle : Clock3

  return (
    <tr>
      <td className="path-cell strong-path">{library.path}</td>
      <td>{library.musicCount}</td>
      <td>
        <span className={`library-status ${library.scan.status}`}>
          <Icon size={15} />
          {statusLabel(library.scan.status)}
        </span>
        {library.scan.message && <small className={library.scan.status === 'failed' ? 'scan-message error' : 'scan-message'}>{library.scan.message}</small>}
      </td>
      <td>
        <div className="mini-progress" aria-label={`扫描进度 ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <small className="progress-text">
          {library.scan.scannedFiles} / {library.scan.totalFiles}
        </small>
      </td>
      <td>{library.scan.completedAt || '未完成'}</td>
      <td>
        <div className="row-actions">
          <button
            type="button"
            aria-label={library.musicCount > 0 ? '再次扫描' : '扫描'}
            title={library.musicCount > 0 ? '再次扫描' : '扫描'}
            disabled={active || isScanning}
            onClick={() => onScan(library)}
          >
            <RefreshCw size={15} />
          </button>
          <button
            className="danger"
            type="button"
            aria-label="删除媒体库"
            title="删除媒体库"
            disabled={active || isDeleting}
            onClick={() => onDelete(library)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function StateMessage({ title, body, tone = 'default' }: { title: string; body: string; tone?: 'default' | 'error' }) {
  return (
    <div className={`empty-state ${tone}`}>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  )
}

function isActiveScan(status: ScanStatus) {
  return status === 'waiting' || status === 'running'
}

function statusLabel(status: ScanStatus) {
  switch (status) {
    case 'idle':
      return '未扫描'
    case 'waiting':
      return '等待中'
    case 'running':
      return '扫描中'
    case 'completed':
      return '完成'
    case 'failed':
      return '失败'
  }
}

function formatDuration(durationMs: number) {
  if (!durationMs) {
    return '未知'
  }
  const totalSeconds = Math.floor(durationMs / 1000)
  return formatDurationSeconds(totalSeconds)
}

function formatDurationSeconds(secondsValue: number) {
  if (!secondsValue || !Number.isFinite(secondsValue)) {
    return '0:00'
  }
  const totalSeconds = Math.floor(secondsValue)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function displayArtist(track: Track) {
  return track.artist?.trim() || '未知艺术家'
}

function displayAlbum(track: Track) {
  return track.album?.trim() || '未知专辑'
}

function playbackLabel(status: PlaybackStatus) {
  switch (status) {
    case 'loading':
      return '加载中'
    case 'playing':
      return '播放中'
    case 'paused':
      return '已暂停'
    case 'ended':
      return '播放结束'
    case 'error':
      return '播放失败'
    case 'idle':
      return '待播放'
  }
}

function viewTitle(view: ViewMode) {
  switch (view) {
    case 'libraries':
      return '媒体库'
    case 'songs':
      return '歌曲管理'
    case 'playlists':
      return '歌单管理'
    case 'liked':
      return '我喜欢'
    case 'recent':
      return '最近播放'
  }
}

function trackRowClass(track: Track, selectedTrack: Track | null, currentTrack: Track | null, status: PlaybackStatus) {
  const classes: string[] = []
  if (selectedTrack?.id === track.id) {
    classes.push('selected')
  }
  if (currentTrack?.id === track.id) {
    classes.push('current', status)
  }
  return classes.join(' ') || undefined
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default App
