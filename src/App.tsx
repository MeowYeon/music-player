import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AudioLines,
  CheckCircle2,
  Clock3,
  ListMusic,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Volume2,
  XCircle,
  X,
} from 'lucide-react'
import {
  getLibrarySummary,
  getScans,
  getTracks,
  getTrackStreamUrl,
  startScan,
  type ScanJob,
  type Track,
} from './api'

const defaultScanPath = '/mnt/c/Users/guohp/Music/test'
type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

function App() {
  const queryClient = useQueryClient()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [query, setQuery] = useState('')
  const [scanPath, setScanPath] = useState(defaultScanPath)
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle')
  const [playerError, setPlayerError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(72)
  const [scanFormError, setScanFormError] = useState('')

  const libraryQuery = useQuery({
    queryKey: ['library'],
    queryFn: getLibrarySummary,
  })

  const tracksQuery = useQuery({
    queryKey: ['tracks', query],
    queryFn: () => getTracks(query),
  })

  const scansQuery = useQuery({
    queryKey: ['scans'],
    queryFn: getScans,
    refetchInterval: (query) => (query.state.data?.current?.status === 'running' ? 1200 : false),
  })

  const scanMutation = useMutation({
    mutationFn: startScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scans'] })
      queryClient.invalidateQueries({ queryKey: ['library'] })
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
    },
  })

  const tracks = tracksQuery.data ?? []
  const currentScan = scansQuery.data?.current
  const recentScans = scansQuery.data?.recent ?? []
  const latestScanStatus = currentScan?.status ?? recentScans[0]?.status
  const activeScan = currentScan ?? recentScans[0]
  const isScanning = scanMutation.isPending || currentScan?.status === 'waiting' || currentScan?.status === 'running'
  const isKnownPath = recentScans.some((scan) => scan.path === scanPath.trim())
  const currentIndex = currentTrack ? tracks.findIndex((track) => track.id === currentTrack.id) : -1
  const canUsePrevious = tracks.length > 0 && currentIndex > 0
  const canUseNext = tracks.length > 0 && currentIndex >= 0 && currentIndex < tracks.length - 1
  const playerDuration = duration || (currentTrack?.durationMs ? currentTrack.durationMs / 1000 : 0)
  const isPlaying = playbackStatus === 'playing'

  useEffect(() => {
    if (latestScanStatus === 'completed' || latestScanStatus === 'failed') {
      queryClient.invalidateQueries({ queryKey: ['library'] })
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
    }
  }, [latestScanStatus, queryClient])

  const librarySummary = useMemo(() => {
    const rootCount = libraryQuery.data?.rootCount ?? 0
    const trackCount = libraryQuery.data?.trackCount ?? tracks.length
    return `${rootCount} 个目录 · ${trackCount} 首歌曲`
  }, [libraryQuery.data, tracks.length])

  const backendStatus = libraryQuery.isError ? '后端未连接' : libraryQuery.isFetching ? '同步中' : '已连接'

  function handleScanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const path = scanPath.trim()
    if (!path) {
      setScanFormError('请输入音乐目录路径。')
      return
    }

    setScanFormError('')
    scanMutation.mutate({ path })
  }

  function handleSelectTrack(track: Track) {
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

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand-mark">
          <AudioLines size={24} strokeWidth={2.2} />
        </div>

        <nav className="nav-list">
          <button className="nav-item active" type="button" aria-label="歌曲">
            <ListMusic size={20} />
            <span>歌曲</span>
          </button>
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>阿言</h1>
            <p>
              {librarySummary}
              <span className={`connection-dot ${libraryQuery.isError ? 'offline' : 'online'}`}>{backendStatus}</span>
            </p>
          </div>

          <label className="search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、艺术家或专辑"
            />
            {query && (
              <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}>
                <X size={16} />
              </button>
            )}
          </label>
        </header>

        <section className="content-grid">
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
                <h3>歌曲</h3>
                <span>{tracks.length} 首</span>
              </div>

              <div className="table-scroll">
                <table className="track-table">
                  <thead>
                    <tr>
                      <th>标题</th>
                      <th>艺术家</th>
                      <th>专辑</th>
                      <th>格式</th>
                      <th>时长</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map((track) => (
                      <tr
                        key={track.id}
                        className={trackRowClass(track, currentTrack, playbackStatus)}
                        onClick={() => handleSelectTrack(track)}
                      >
                        <td>
                          <button type="button" className="track-title">
                            {track.title}
                          </button>
                        </td>
                        <td className={!track.artist ? 'muted-cell' : undefined}>{displayArtist(track)}</td>
                        <td className={!track.album ? 'muted-cell' : undefined}>{displayAlbum(track)}</td>
                        <td>
                          <span className="format-chip">{track.format}</span>
                        </td>
                        <td>{formatDuration(track.durationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {tracksQuery.isLoading && <StateMessage title="正在读取歌曲库" body="稍等一下，阿言正在同步本地媒体库。" />}
              {tracksQuery.isError && <StateMessage title="歌曲加载失败" body="请确认后端服务已启动，然后刷新页面或重新扫描。" tone="error" />}
              {!tracksQuery.isLoading && !tracksQuery.isError && !tracks.length && (
                <StateMessage
                  title={query ? '没有匹配的歌曲' : isScanning ? '正在扫描音乐目录' : '还没有歌曲'}
                  body={query ? '换个关键词试试，或清空搜索查看全部歌曲。' : isScanning ? '扫描完成后，这里会自动展示歌曲列表。' : '在右侧输入音乐目录并开始扫描后，这里会展示歌曲列表。'}
                />
              )}
            </div>
          </section>

          <aside className="scan-panel" aria-label="扫描任务">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Library scan</span>
                <h2>扫描任务</h2>
              </div>
              <span className={`status-pill ${activeScan ? activeScan.status : 'completed'}`}>
                {activeScan ? statusLabel(activeScan.status) : '空闲'}
              </span>
            </div>

            <form className="scan-form" onSubmit={handleScanSubmit}>
              <label htmlFor="scan-path">音乐目录</label>
              <input
                id="scan-path"
                value={scanPath}
                onChange={(event) => setScanPath(event.target.value)}
                placeholder="/home/ghp/Music"
                disabled={isScanning}
              />
              <div className="default-rules" aria-label="默认扫描规则">
                <span>递归扫描</span>
                <span>忽略隐藏文件</span>
                {isKnownPath && <span>重新扫描此目录</span>}
              </div>
              {(scanFormError || scanMutation.isError) && (
                <p className="form-error">{scanFormError || errorMessage(scanMutation.error, '扫描任务创建失败。')}</p>
              )}
              <button className="primary-button" type="submit" disabled={isScanning}>
                {scanMutation.isPending ? '创建中' : isScanning ? '扫描中' : '开始扫描'}
              </button>
            </form>

            {activeScan && <ScanProgress scan={activeScan} title={currentScan ? '当前任务' : '最近一次扫描'} />}

            <section className="recent-scans">
              <div className="section-title">
                <h3>最近任务</h3>
                <span>{recentScans.length}</span>
              </div>

              <div className="scan-list">
                {recentScans.map((scan) => (
                  <ScanItem key={scan.id} scan={scan} />
                ))}
              </div>
            </section>
          </aside>
        </section>
      </main>

      <footer className="player-bar">
        <div className="player-track">
          <div className="track-glyph">
            <AudioLines size={18} />
          </div>
          <div>
            <strong>{currentTrack?.title ?? '未选择歌曲'}</strong>
            <span>{currentTrack?.artist ?? '选择歌曲后开始播放'}</span>
          </div>
        </div>

        <div className="player-controls">
          <button type="button" aria-label="上一首" disabled={!canUsePrevious} onClick={handlePreviousTrack} title="上一首">
            <SkipBack size={19} />
          </button>
          <button className="play-button" type="button" aria-label={isPlaying ? '暂停' : '播放'} onClick={handleTogglePlayback} title={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
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

        <label className="volume-control">
          <Volume2 size={18} />
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => handleVolumeChange(Number(event.target.value))}
            aria-label="音量"
          />
        </label>

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

function ScanProgress({ scan, title }: { scan: ScanJob; title: string }) {
  const progress = scan.totalFiles > 0 ? Math.round((scan.scannedFiles / scan.totalFiles) * 100) : 0

  return (
    <section className="current-scan">
      <span className="current-scan-title">{title}</span>
      <div className="scan-progress-meta">
        <span>{statusLabel(scan.status)}</span>
        <strong>
          {scan.scannedFiles} / {scan.totalFiles}
        </strong>
      </div>
      <div className="progress-track" aria-label={`扫描进度 ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <p>{scan.path}</p>
      {scan.errorMessage && <em>{scan.errorMessage}</em>}
    </section>
  )
}

function ScanItem({ scan }: { scan: ScanJob }) {
  const Icon = scan.status === 'completed' ? CheckCircle2 : scan.status === 'failed' ? XCircle : Clock3

  return (
    <article className="scan-item">
      <Icon className={`scan-icon ${scan.status}`} size={18} />
      <div>
        <strong>{scan.path}</strong>
        <span>
          {statusLabel(scan.status)} · {scan.scannedFiles}/{scan.totalFiles} · {scan.startedAt}
        </span>
        {scan.errorMessage && <em>{scan.errorMessage}</em>}
      </div>
    </article>
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

function statusLabel(status: ScanJob['status']) {
  switch (status) {
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

function trackRowClass(track: Track, currentTrack: Track | null, status: PlaybackStatus) {
  if (currentTrack?.id !== track.id) {
    return undefined
  }
  return `selected ${status}`
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default App
