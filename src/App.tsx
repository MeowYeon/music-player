import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AudioLines,
  CheckCircle2,
  Clock3,
  FolderSearch,
  ListMusic,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Volume2,
  XCircle,
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

function App() {
  const queryClient = useQueryClient()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [query, setQuery] = useState('')
  const [scanPath, setScanPath] = useState(defaultScanPath)
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(72)

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

  function handleScanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const path = scanPath.trim()
    if (!path) {
      return
    }

    scanMutation.mutate({ path })
  }

  function handleSelectTrack(track: Track) {
    setCurrentTrack(track)
    setIsPlaying(true)

    window.setTimeout(() => {
      audioRef.current?.play().catch(() => {
        setIsPlaying(false)
      })
    }, 0)
  }

  function handleTogglePlayback() {
    if (!currentTrack) {
      return
    }

    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
      return
    }

    audioRef.current?.play().then(
      () => setIsPlaying(true),
      () => setIsPlaying(false),
    )
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
          <button className="nav-item" type="button" aria-label="扫描任务">
            <FolderSearch size={20} />
            <span>扫描任务</span>
          </button>
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>阿言</h1>
            <p>{librarySummary}</p>
          </div>

          <label className="search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、艺术家或专辑"
            />
          </label>
        </header>

        <section className="content-grid">
          <section className="library-pane" aria-label="歌曲库">
            <div className="now-summary">
              <div>
                <span className="eyebrow">正在播放</span>
                <h2>{currentTrack?.title ?? '未选择歌曲'}</h2>
                <p>{currentTrack ? `${currentTrack.artist} · ${currentTrack.album}` : '从歌曲列表选择一首开始播放'}</p>
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
                      className={currentTrack?.id === track.id ? 'selected' : undefined}
                      onClick={() => handleSelectTrack(track)}
                    >
                      <td>
                        <button type="button" className="track-title">
                          {track.title}
                        </button>
                      </td>
                      <td>{track.artist}</td>
                      <td>{track.album}</td>
                      <td>
                        <span className="format-chip">{track.format}</span>
                      </td>
                      <td>{formatDuration(track.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!tracks.length && (
                <div className="empty-state">
                  <h3>还没有歌曲</h3>
                  <p>在右侧输入音乐目录并开始扫描后，这里会展示歌曲列表。</p>
                </div>
              )}
            </div>
          </section>

          <aside className="scan-panel" aria-label="扫描任务">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Library scan</span>
                <h2>扫描任务</h2>
              </div>
              <span className={`status-pill ${currentScan ? currentScan.status : 'completed'}`}>
                {currentScan ? statusLabel(currentScan.status) : '空闲'}
              </span>
            </div>

            <form className="scan-form" onSubmit={handleScanSubmit}>
              <label htmlFor="scan-path">音乐目录</label>
              <input
                id="scan-path"
                value={scanPath}
                onChange={(event) => setScanPath(event.target.value)}
                placeholder="/home/ghp/Music"
              />
              <div className="default-rules" aria-label="默认扫描规则">
                <span>递归扫描</span>
                <span>忽略隐藏文件</span>
              </div>
              <button className="primary-button" type="submit" disabled={scanMutation.isPending}>
                {scanMutation.isPending ? '创建中' : '开始扫描'}
              </button>
            </form>

            {currentScan && <ScanProgress scan={currentScan} />}

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
          <button type="button" aria-label="上一首">
            <SkipBack size={19} />
          </button>
          <button className="play-button" type="button" aria-label={isPlaying ? '暂停' : '播放'} onClick={handleTogglePlayback}>
            {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
          <button type="button" aria-label="下一首">
            <SkipForward size={19} />
          </button>
        </div>

        <div className="player-progress">
          <span>0:00</span>
          <input type="range" min="0" max="100" value="0" readOnly aria-label="播放进度" />
          <span>{currentTrack ? formatDuration(currentTrack.durationMs) : '0:00'}</span>
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
          onEnded={() => setIsPlaying(false)}
        />
      </footer>
    </div>
  )
}

function ScanProgress({ scan }: { scan: ScanJob }) {
  const progress = scan.totalFiles > 0 ? Math.round((scan.scannedFiles / scan.totalFiles) * 100) : 0

  return (
    <section className="current-scan">
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
  const totalSeconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default App
