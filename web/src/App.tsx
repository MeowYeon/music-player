import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AudioLines,
  CheckCircle2,
  Clock3,
  Heart,
  History,
  ListMusic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  X,
  XCircle,
} from 'lucide-react'
import {
  addTrackToPlaylist,
  clearRecentTracks,
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
  likeTrack,
  recordRecentPlay,
  renamePlaylist,
  removeTrackFromPlaylist,
  scanLibrary,
  unlikeTrack,
  type LibraryItem,
  type Playlist,
  type RecentTrackItem,
  type ScanStatus,
  type Track,
} from './api'
import { AppShell } from './components/AppShell'
import { QueueDrawer } from './components/QueueDrawer'
import { PlaylistTrackTable, StateMessage, TrackFilterBar, TrackListToolbar } from './components/TrackList'
import {
  getNextPlayMode,
  getNextQueueTrack,
  insertTracksAfterCurrent as insertTracksAfterCurrentInQueue,
  readStoredPlayerState,
  writeStoredPlayerState,
  type PlayMode,
  type StoredPlayerState,
} from './player'
import { formatDurationSeconds, playModeLabel, type PlaybackStatus } from './playback'
import { displayArtist, sortTracks, type TrackSortField } from './tracks'

const defaultLibraryPath = '/mnt/c/Users/guohp/Music/test'
export type ViewMode = 'libraries' | 'songs' | 'playlists' | 'liked' | 'recent'

function App() {
  const queryClient = useQueryClient()
  const audioRef = useRef<HTMLAudioElement>(null)
  const previousActiveCountRef = useRef(0)
  const lastRecordedTrackIdRef = useRef<number | null>(null)
  const storedPlayerStateRef = useRef(readStoredPlayerState())
  const [view, setView] = useState<ViewMode>('songs')
  const [isNavigationCollapsed, setIsNavigationCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const [sortField, setSortField] = useState<TrackSortField>('title')
  const [formatFilter, setFormatFilter] = useState('')
  const [likedOnly, setLikedOnly] = useState(false)
  const [playlistName, setPlaylistName] = useState('')
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null)
  const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([])
  const [openTrackMenuId, setOpenTrackMenuId] = useState<number | null>(null)
  const [playlistDialogTracks, setPlaylistDialogTracks] = useState<Track[]>([])
  const [playlistDialogPlaylistId, setPlaylistDialogPlaylistId] = useState<number | null>(null)
  const [playlistDialogName, setPlaylistDialogName] = useState('')
  const [playlistDialogError, setPlaylistDialogError] = useState('')
  const [isPlaylistDialogSaving, setIsPlaylistDialogSaving] = useState(false)
  const [queue, setQueue] = useState<Track[]>([])
  const [playMode, setPlayMode] = useState<PlayMode>(storedPlayerStateRef.current.playMode ?? 'sequence')
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [libraryPath, setLibraryPath] = useState(defaultLibraryPath)
  const [libraryFormError, setLibraryFormError] = useState('')
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle')
  const [playerError, setPlayerError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(storedPlayerStateRef.current.volume ?? 72)
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

  const removeTrackFromPlaylistMutation = useMutation({
    mutationFn: ({ playlistId, trackId }: { playlistId: number; trackId: number }) => removeTrackFromPlaylist(playlistId, trackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      queryClient.invalidateQueries({ queryKey: ['playlist-tracks'] })
    },
  })

  const toggleLikeMutation = useMutation({
    mutationFn: (track: Track) => (track.liked ? unlikeTrack(track.id) : likeTrack(track.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
      queryClient.invalidateQueries({ queryKey: ['playlist-tracks'] })
    },
  })

  const recordRecentPlayMutation = useMutation({
    mutationFn: recordRecentPlay,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlist-tracks', 'recent'] })
    },
  })

  const clearRecentTracksMutation = useMutation({
    mutationFn: clearRecentTracks,
    onSuccess: () => {
      setSelectedTrackIds([])
      queryClient.invalidateQueries({ queryKey: ['playlist-tracks', 'recent'] })
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
  const visibleTracks = useMemo(() => {
    return sortTracks(
      tracks.filter((track) => {
        if (formatFilter && track.format !== formatFilter) {
          return false
        }
        if (likedOnly && !track.liked) {
          return false
        }
        return true
      }),
      sortField,
    )
  }, [formatFilter, likedOnly, sortField, tracks])
  const availableFormats = useMemo(() => Array.from(new Set(tracks.map((track) => track.format))).sort(), [tracks])
  const playlists = playlistsQuery.data ?? []
  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null
  const activePlaylistTracks = playlistTracksQuery.data ?? []
  const likedTracks = likedTracksQuery.data ?? []
  const recentTrackItems = recentTracksQuery.data ?? []
  const recentTracks = recentTrackItems.map((item) => item.track)
  const allKnownTracks = useMemo(() => {
    const byID = new Map<number, Track>()
    for (const track of [...tracks, ...activePlaylistTracks, ...likedTracks, ...recentTracks, ...queue]) {
      byID.set(track.id, track)
    }
    return byID
  }, [activePlaylistTracks, likedTracks, queue, recentTracks, tracks])

  useEffect(() => {
    if (!tracks.length || queue.length || currentTrack) {
      return
    }
    const stored = storedPlayerStateRef.current
    const restoredQueue = (stored.queueTrackIds ?? [])
      .map((id) => tracks.find((track) => track.id === id))
      .filter((track): track is Track => Boolean(track))
    const restoredCurrent = stored.currentTrackId ? tracks.find((track) => track.id === stored.currentTrackId) ?? null : null
    if (restoredQueue.length) {
      setQueue(restoredQueue)
    }
    if (restoredCurrent) {
      setCurrentTrack(restoredCurrent)
      setPlaybackStatus('paused')
    }
  }, [currentTrack, queue.length, tracks])

  useEffect(() => {
    const validIDs = new Set(allKnownTracks.keys())
    setSelectedTrackIds((ids) => ids.filter((id) => validIDs.has(id)))
  }, [allKnownTracks])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100
    }
  }, [volume])

  useEffect(() => {
    writeStoredPlayerState({
      volume,
      playMode,
      queueTrackIds: queue.map((track) => track.id),
      currentTrackId: currentTrack?.id ?? null,
    })
  }, [currentTrack?.id, playMode, queue, volume])

  useEffect(() => {
    if (!playlists.length) {
      setSelectedPlaylistId(null)
      return
    }
    if (selectedPlaylistId === null) {
      setSelectedPlaylistId(playlists[0].id)
      return
    }
    if (!playlists.some((playlist) => playlist.id === selectedPlaylistId)) {
      setSelectedPlaylistId(playlists[0].id)
    }
  }, [playlists, selectedPlaylistId])

  useEffect(() => {
    if (!playlistDialogTracks.length) {
      return
    }
    if (!playlists.length) {
      setPlaylistDialogPlaylistId(null)
      return
    }
    if (playlistDialogPlaylistId === null || !playlists.some((playlist) => playlist.id === playlistDialogPlaylistId)) {
      setPlaylistDialogPlaylistId(playlists[0].id)
    }
  }, [playlistDialogPlaylistId, playlistDialogTracks.length, playlists])
  const queueIndex = currentTrack ? queue.findIndex((track) => track.id === currentTrack.id) : -1
  const canUsePrevious = playMode === 'single' ? Boolean(currentTrack) : queue.length > 0 && queueIndex > 0
  const canUseNext =
    playMode === 'single'
      ? Boolean(currentTrack)
      : queue.length > 0 && (playMode === 'loop' || playMode === 'shuffle' || (queueIndex >= 0 && queueIndex < queue.length - 1))
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
    const confirmed = window.confirm(`确定删除歌单「${playlist.name}」吗？\n\n这只会删除歌单，不会删除本地音乐文件。`)
    if (!confirmed) {
      return
    }
    deletePlaylistMutation.mutate(playlist.id)
  }

  function handleSelectTrack(track: Track) {
    setSelectedTrack(track)
  }

  function handleToggleTrackSelected(track: Track, checked: boolean) {
    setSelectedTrack(track)
    setSelectedTrackIds((ids) => {
      if (checked) {
        return ids.includes(track.id) ? ids : [...ids, track.id]
      }
      return ids.filter((id) => id !== track.id)
    })
  }

  function handleToggleAllTracks(trackList: Track[], checked: boolean) {
    const ids = trackList.map((track) => track.id)
    setSelectedTrackIds((currentIDs) => {
      if (!checked) {
        return currentIDs.filter((id) => !ids.includes(id))
      }
      return Array.from(new Set([...currentIDs, ...ids]))
    })
  }

  function handlePlayTrackFromList(track: Track) {
    setSelectedTrack(track)
    setOpenTrackMenuId(null)
    setQueue((items) => [track, ...items.filter((item) => item.id !== track.id)])
    playTrack(track)
  }

  function handlePlayTrackList(trackList: Track[]) {
    const [firstTrack] = trackList
    if (!firstTrack) {
      return
    }
    setSelectedTrack(firstTrack)
    setOpenTrackMenuId(null)
    setQueue(trackList)
    playTrack(firstTrack)
  }

  function handleShuffleTrackList(trackList: Track[]) {
    const shuffledTracks = [...trackList]
    for (let index = shuffledTracks.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      ;[shuffledTracks[index], shuffledTracks[swapIndex]] = [shuffledTracks[swapIndex], shuffledTracks[index]]
    }
    setPlayMode('shuffle')
    handlePlayTrackList(shuffledTracks)
  }

  function handleToggleLike(track: Track) {
    toggleLikeMutation.mutate(track)
  }

  async function handleBatchLike(trackList: Track[], liked: boolean) {
    await Promise.all(trackList.map((track) => (liked ? likeTrack(track.id) : unlikeTrack(track.id))))
    setSelectedTrackIds([])
    queryClient.invalidateQueries({ queryKey: ['tracks'] })
    queryClient.invalidateQueries({ queryKey: ['playlist-tracks'] })
  }

  function handleOpenPlaylistDialog(track: Track) {
    setSelectedTrack(track)
    setOpenTrackMenuId(null)
    setPlaylistDialogTracks([track])
    setPlaylistDialogPlaylistId(playlists[0]?.id ?? null)
    setPlaylistDialogName('')
    setPlaylistDialogError('')
  }

  function handleOpenPlaylistDialogForTracks(trackList: Track[]) {
    if (!trackList.length) {
      return
    }
    setSelectedTrack(trackList[0])
    setOpenTrackMenuId(null)
    setPlaylistDialogTracks(trackList)
    setPlaylistDialogPlaylistId(playlists[0]?.id ?? null)
    setPlaylistDialogName('')
    setPlaylistDialogError('')
  }

  function handleClosePlaylistDialog() {
    if (isPlaylistDialogSaving) {
      return
    }
    setPlaylistDialogTracks([])
    setPlaylistDialogPlaylistId(null)
    setPlaylistDialogName('')
    setPlaylistDialogError('')
  }

  function handleConfirmAddToPlaylist() {
    if (!playlistDialogTracks.length) {
      return
    }
    if (playlistDialogPlaylistId === null) {
      setPlaylistDialogError('请选择一个歌单，或新建歌单后添加。')
      return
    }

    setIsPlaylistDialogSaving(true)
    Promise.all(playlistDialogTracks.map((track) => addTrackToPlaylist(playlistDialogPlaylistId, track.id)))
      .then(() => {
        setSelectedTrackIds([])
        setPlaylistDialogTracks([])
        setPlaylistDialogPlaylistId(null)
        setPlaylistDialogName('')
        setPlaylistDialogError('')
        queryClient.invalidateQueries({ queryKey: ['playlists'] })
        queryClient.invalidateQueries({ queryKey: ['playlist-tracks'] })
      })
      .catch((error) => setPlaylistDialogError(errorMessage(error, '添加歌曲到歌单失败。')))
      .finally(() => setIsPlaylistDialogSaving(false))
  }

  async function handleCreatePlaylistAndAdd() {
    if (!playlistDialogTracks.length) {
      return
    }
    const name = playlistDialogName.trim()
    if (!name) {
      setPlaylistDialogError('请输入歌单名称。')
      return
    }

    setIsPlaylistDialogSaving(true)
    setPlaylistDialogError('')
    try {
      const playlist = await createPlaylist(name)
      await Promise.all(playlistDialogTracks.map((track) => addTrackToPlaylist(playlist.id, track.id)))
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      queryClient.invalidateQueries({ queryKey: ['playlist-tracks'] })
      setSelectedTrackIds([])
      setSelectedPlaylistId(playlist.id)
      setPlaylistDialogTracks([])
      setPlaylistDialogPlaylistId(null)
      setPlaylistDialogName('')
    } catch (error) {
      setPlaylistDialogError(errorMessage(error, '创建歌单或添加歌曲失败。'))
    } finally {
      setIsPlaylistDialogSaving(false)
    }
  }

  function handleToggleTrackMenu(track: Track) {
    setOpenTrackMenuId((id) => (id === track.id ? null : track.id))
  }

  function handlePlayNext(track: Track) {
    setSelectedTrack(track)
    setOpenTrackMenuId(null)
    insertTracksAfterCurrent([track])
  }

  function handlePlayNextTracks(trackList: Track[]) {
    if (!trackList.length) {
      return
    }
    setSelectedTrack(trackList[0])
    setOpenTrackMenuId(null)
    insertTracksAfterCurrent(trackList)
    setSelectedTrackIds([])
  }

  function insertTracksAfterCurrent(trackList: Track[]) {
    setQueue((items) => insertTracksAfterCurrentInQueue({ queue: items, currentTrack, tracksToInsert: trackList }))
  }

  function handleRemoveTrackFromPlaylist(track: Track) {
    if (selectedPlaylistId === null) {
      return
    }
    removeTrackFromPlaylistMutation.mutate({ playlistId: selectedPlaylistId, trackId: track.id })
  }

  async function handleRemoveTracksFromPlaylist(trackList: Track[]) {
    if (selectedPlaylistId === null || !trackList.length) {
      return
    }
    await Promise.all(trackList.map((track) => removeTrackFromPlaylist(selectedPlaylistId, track.id)))
    setSelectedTrackIds([])
    queryClient.invalidateQueries({ queryKey: ['playlists'] })
    queryClient.invalidateQueries({ queryKey: ['playlist-tracks'] })
  }

  function handleClearRecentTracks() {
    if (!recentTracks.length) {
      return
    }
    const confirmed = window.confirm('确定清空最近播放吗？这不会删除本地音乐文件。')
    if (!confirmed) {
      return
    }
    clearRecentTracksMutation.mutate()
  }

  function playTrack(track: Track) {
    setCurrentTrack(track)
    setPlaybackStatus('loading')
    setPlayerError('')
    setCurrentTime(0)
    setDuration(0)
    lastRecordedTrackIdRef.current = null

    window.setTimeout(() => {
      audioRef.current?.play().catch(() => {
        setPlaybackStatus('error')
        setPlayerError('播放失败，请确认文件仍然存在且浏览器支持该格式。')
      })
    }, 0)
  }

  function handleTogglePlayback() {
    const track = currentTrack ?? queue[0] ?? tracks[0]
    if (!track) {
      return
    }
    if (!currentTrack) {
      setQueue((items) => (items.some((item) => item.id === track.id) ? items : [track, ...items]))
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
    if (playMode === 'single' && currentTrack) {
      playTrack(currentTrack)
      return
    }
    if (queueIndex > 0) {
      playTrack(queue[queueIndex - 1])
    }
  }

  function handleNextTrack() {
    const nextTrack = nextQueueTrack()
    if (nextTrack) {
      playTrack(nextTrack)
    }
  }

  function handlePlayModeToggle() {
    setPlayMode(getNextPlayMode)
  }

  function handleRemoveQueueTrack(track: Track) {
    setQueue((items) => items.filter((item) => item.id !== track.id || item.id === currentTrack?.id))
  }

  function nextQueueTrack() {
    return getNextQueueTrack({ queue, currentTrack, playMode })
  }

  function recordCurrentTrackPlay() {
    if (!currentTrack || lastRecordedTrackIdRef.current === currentTrack.id) {
      return
    }
    lastRecordedTrackIdRef.current = currentTrack.id
    recordRecentPlayMutation.mutate(currentTrack.id)
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

  function handleGlobalSearchChange(value: string) {
    setQuery(value)
    if (value.trim() && view !== 'songs') {
      setView('songs')
    }
  }

  const topbarTitle = viewTitle(view)

  return (
    <>
      <AppShell
        view={view}
        topbarTitle={topbarTitle}
        librarySummary={librarySummary}
        backendStatus={backendStatus}
        isBackendOffline={librarySummaryQuery.isError}
        query={query}
        isNavigationCollapsed={isNavigationCollapsed}
        onViewChange={setView}
        onSearchChange={handleGlobalSearchChange}
        onClearSearch={() => setQuery('')}
        onToggleNavigation={() => setIsNavigationCollapsed((collapsed) => !collapsed)}
      >
        {view === 'songs' ? (
          <SongsView
            tracks={visibleTracks}
            totalTracks={tracks.length}
            availableFormats={availableFormats}
            sortField={sortField}
            formatFilter={formatFilter}
            likedOnly={likedOnly}
            selectedTrackIds={selectedTrackIds}
            selectedTrack={selectedTrack}
            currentTrack={currentTrack}
            playbackStatus={playbackStatus}
            playerError={playerError}
            isLoading={tracksQuery.isLoading}
            isError={tracksQuery.isError}
            query={query}
            onSortFieldChange={setSortField}
            onFormatFilterChange={setFormatFilter}
            onLikedOnlyChange={setLikedOnly}
            onSelectTrack={handleSelectTrack}
            onToggleTrackSelected={handleToggleTrackSelected}
            onToggleAllTracks={handleToggleAllTracks}
            onPlayAll={handlePlayTrackList}
            onShuffleAll={handleShuffleTrackList}
            onPlaySelected={handlePlayTrackList}
            onPlayTrack={handlePlayTrackFromList}
            onToggleLike={handleToggleLike}
            onBatchLike={handleBatchLike}
            onToggleMenu={handleToggleTrackMenu}
            onOpenPlaylistDialog={handleOpenPlaylistDialog}
            onOpenPlaylistDialogForTracks={handleOpenPlaylistDialogForTracks}
            onPlayNext={handlePlayNext}
            onPlayNextTracks={handlePlayNextTracks}
            openTrackMenuId={openTrackMenuId}
            playlists={playlists}
          />
        ) : view === 'libraries' ? (
          <LibrariesView
            libraries={libraries}
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
              isLoading={playlistsQuery.isLoading || (selectedPlaylist !== null && playlistTracksQuery.isLoading)}
              isError={playlistsQuery.isError || (selectedPlaylist !== null && playlistTracksQuery.isError)}
              isCreating={createPlaylistMutation.isPending}
              isMutating={renamePlaylistMutation.isPending || deletePlaylistMutation.isPending}
              selectedTrack={selectedTrack}
              currentTrack={currentTrack}
              playbackStatus={playbackStatus}
              selectedTrackIds={selectedTrackIds}
              onNameChange={setPlaylistName}
              onSubmit={handlePlaylistSubmit}
              onSelectPlaylist={setSelectedPlaylistId}
              onRenamePlaylist={handleRenamePlaylist}
              onDeletePlaylist={handleDeletePlaylist}
              onSelectTrack={handleSelectTrack}
              onToggleTrackSelected={handleToggleTrackSelected}
              onToggleAllTracks={handleToggleAllTracks}
              onPlayAll={handlePlayTrackList}
              onPlaySelected={handlePlayTrackList}
              onPlayTrack={handlePlayTrackFromList}
              onToggleLike={handleToggleLike}
              onBatchLike={handleBatchLike}
              onToggleMenu={handleToggleTrackMenu}
              onOpenPlaylistDialog={handleOpenPlaylistDialog}
              onOpenPlaylistDialogForTracks={handleOpenPlaylistDialogForTracks}
              onPlayNext={handlePlayNext}
              onPlayNextTracks={handlePlayNextTracks}
              onRemoveTrack={handleRemoveTrackFromPlaylist}
              onRemoveTracks={handleRemoveTracksFromPlaylist}
              openTrackMenuId={openTrackMenuId}
            />
        ) : view === 'liked' ? (
          <LikedTracksView
            tracks={likedTracks}
            selectedTrack={selectedTrack}
            currentTrack={currentTrack}
            playbackStatus={playbackStatus}
            selectedTrackIds={selectedTrackIds}
            isLoading={likedTracksQuery.isLoading}
            isError={likedTracksQuery.isError}
            onSelectTrack={handleSelectTrack}
            onToggleTrackSelected={handleToggleTrackSelected}
            onToggleAllTracks={handleToggleAllTracks}
            onPlayAll={handlePlayTrackList}
            onShuffleAll={handleShuffleTrackList}
            onPlaySelected={handlePlayTrackList}
            onPlayTrack={handlePlayTrackFromList}
            onToggleLike={handleToggleLike}
            onBatchLike={handleBatchLike}
            onToggleMenu={handleToggleTrackMenu}
            onOpenPlaylistDialog={handleOpenPlaylistDialog}
            onOpenPlaylistDialogForTracks={handleOpenPlaylistDialogForTracks}
            onPlayNext={handlePlayNext}
            onPlayNextTracks={handlePlayNextTracks}
            openTrackMenuId={openTrackMenuId}
          />
        ) : (
          <RecentPlaysView
            items={recentTrackItems}
            selectedTrack={selectedTrack}
            currentTrack={currentTrack}
            playbackStatus={playbackStatus}
            selectedTrackIds={selectedTrackIds}
            isLoading={recentTracksQuery.isLoading}
            isError={recentTracksQuery.isError}
            onSelectTrack={handleSelectTrack}
            onToggleTrackSelected={handleToggleTrackSelected}
            onToggleAllTracks={handleToggleAllTracks}
            onPlayAll={handlePlayTrackList}
            onPlaySelected={handlePlayTrackList}
            onPlayTrack={handlePlayTrackFromList}
            onToggleLike={handleToggleLike}
            onBatchLike={handleBatchLike}
            onToggleMenu={handleToggleTrackMenu}
            onOpenPlaylistDialog={handleOpenPlaylistDialog}
            onOpenPlaylistDialogForTracks={handleOpenPlaylistDialogForTracks}
            onPlayNext={handlePlayNext}
            onPlayNextTracks={handlePlayNextTracks}
            onClearTracks={handleClearRecentTracks}
            isClearing={clearRecentTracksMutation.isPending}
            openTrackMenuId={openTrackMenuId}
          />
        )}
      </AppShell>

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

        <button type="button" className="player-mode-button" onClick={handlePlayModeToggle} aria-label={playModeLabel(playMode)} title={playModeLabel(playMode)}>
          {playMode === 'shuffle' ? <Shuffle size={17} /> : <Repeat size={17} />}
          <span>{playModeLabel(playMode)}</span>
        </button>

        <div className="player-right-tools">
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
          <button
            type="button"
            className={`queue-button ${isQueueOpen ? 'active' : ''}`}
            aria-label="播放队列"
            title="播放队列"
            onClick={() => setIsQueueOpen((open) => !open)}
          >
            <ListMusic size={18} />
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
          onPlaying={() => {
            setPlaybackStatus('playing')
            recordCurrentTrackPlay()
          }}
          onPause={() => setPlaybackStatus((status) => (status === 'ended' || status === 'error' ? status : 'paused'))}
          onWaiting={() => setPlaybackStatus('loading')}
          onEnded={() => {
            setCurrentTime(0)
            const nextTrack = nextQueueTrack()
            if (nextTrack) {
              playTrack(nextTrack)
              return
            }
            setPlaybackStatus('ended')
          }}
          onError={() => {
            setPlaybackStatus('error')
            setPlayerError('播放失败，请确认文件仍然存在且格式受支持。')
          }}
        />
      </footer>

      {isQueueOpen && (
        <QueueDrawer
          queue={queue}
          currentTrack={currentTrack}
          playbackStatus={playbackStatus}
          playMode={playMode}
          onClose={() => setIsQueueOpen(false)}
          onPlayTrack={handlePlayTrackFromList}
          onRemoveTrack={handleRemoveQueueTrack}
        />
      )}

      {playlistDialogTracks.length > 0 && (
        <PlaylistPickerModal
          tracks={playlistDialogTracks}
          playlists={playlists}
          selectedPlaylistId={playlistDialogPlaylistId}
          newPlaylistName={playlistDialogName}
          error={playlistDialogError}
          isSaving={isPlaylistDialogSaving}
          onSelectPlaylist={setPlaylistDialogPlaylistId}
          onNewPlaylistNameChange={setPlaylistDialogName}
          onConfirm={handleConfirmAddToPlaylist}
          onCreateAndAdd={handleCreatePlaylistAndAdd}
          onClose={handleClosePlaylistDialog}
        />
      )}
    </>
  )
}

function PlaylistPickerModal({
  tracks,
  playlists,
  selectedPlaylistId,
  newPlaylistName,
  error,
  isSaving,
  onSelectPlaylist,
  onNewPlaylistNameChange,
  onConfirm,
  onCreateAndAdd,
  onClose,
}: {
  tracks: Track[]
  playlists: Playlist[]
  selectedPlaylistId: number | null
  newPlaylistName: string
  error: string
  isSaving: boolean
  onSelectPlaylist: (id: number) => void
  onNewPlaylistNameChange: (name: string) => void
  onConfirm: () => void
  onCreateAndAdd: () => void
  onClose: () => void
}) {
  const title = tracks.length === 1 ? tracks[0].title : `${tracks.length} 首歌曲`
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="playlist-modal" role="dialog" aria-modal="true" aria-labelledby="playlist-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 id="playlist-modal-title">添加到歌单</h2>
            <p title={title}>正在添加：{title}</p>
          </div>
          <button type="button" aria-label="关闭" title="关闭" onClick={onClose} disabled={isSaving}>
            <X size={18} />
          </button>
        </div>

        <div className="playlist-choice-list">
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              className={`playlist-choice ${selectedPlaylistId === playlist.id ? 'selected' : ''}`}
              onClick={() => onSelectPlaylist(playlist.id)}
            >
              <span aria-hidden="true" />
              <strong>{playlist.name}</strong>
              <small>{playlist.trackCount} 首歌曲</small>
            </button>
          ))}
          {!playlists.length && <p className="playlist-choice-empty">还没有普通歌单，可以直接新建一个并添加当前歌曲。</p>}
        </div>

        <div className="modal-divider" />

        <div className="create-playlist-box">
          <label htmlFor="modal-playlist-name">新建歌单并添加</label>
          <div>
            <input
              id="modal-playlist-name"
              value={newPlaylistName}
              onChange={(event) => onNewPlaylistNameChange(event.target.value)}
              placeholder="输入歌单名称"
              disabled={isSaving}
            />
            <button type="button" onClick={onCreateAndAdd} disabled={isSaving || !newPlaylistName.trim()}>
              创建并添加
            </button>
          </div>
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={isSaving}>
            取消
          </button>
          <button type="button" className="primary-button" onClick={onConfirm} disabled={isSaving || selectedPlaylistId === null}>
            添加到选中歌单
          </button>
        </div>
      </section>
    </div>
  )
}

function formatPlayedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function SongsView({
  tracks,
  totalTracks,
  availableFormats,
  sortField,
  formatFilter,
  likedOnly,
  selectedTrackIds,
  selectedTrack,
  currentTrack,
  playbackStatus,
  playerError,
  isLoading,
  isError,
  query,
  onSortFieldChange,
  onFormatFilterChange,
  onLikedOnlyChange,
  onSelectTrack,
  onToggleTrackSelected,
  onToggleAllTracks,
  onPlayAll,
  onShuffleAll,
  onPlaySelected,
  onPlayTrack,
  onToggleLike,
  onBatchLike,
  onToggleMenu,
  onOpenPlaylistDialog,
  onOpenPlaylistDialogForTracks,
  onPlayNext,
  onPlayNextTracks,
  openTrackMenuId,
  playlists,
}: {
  tracks: Track[]
  totalTracks: number
  availableFormats: string[]
  sortField: TrackSortField
  formatFilter: string
  likedOnly: boolean
  selectedTrackIds: number[]
  selectedTrack: Track | null
  currentTrack: Track | null
  playbackStatus: PlaybackStatus
  playerError: string
  isLoading: boolean
  isError: boolean
  query: string
  onSortFieldChange: (field: TrackSortField) => void
  onFormatFilterChange: (format: string) => void
  onLikedOnlyChange: (likedOnly: boolean) => void
  onSelectTrack: (track: Track) => void
  onToggleTrackSelected: (track: Track, checked: boolean) => void
  onToggleAllTracks: (tracks: Track[], checked: boolean) => void
  onPlayAll: (tracks: Track[]) => void
  onShuffleAll: (tracks: Track[]) => void
  onPlaySelected: (tracks: Track[]) => void
  onPlayTrack: (track: Track) => void
  onToggleLike: (track: Track) => void
  onBatchLike: (tracks: Track[], liked: boolean) => void
  onToggleMenu: (track: Track) => void
  onOpenPlaylistDialog: (track: Track) => void
  onOpenPlaylistDialogForTracks: (tracks: Track[]) => void
  onPlayNext: (track: Track) => void
  onPlayNextTracks: (tracks: Track[]) => void
  openTrackMenuId: number | null
  playlists: Playlist[]
}) {
  const selectedTracks = tracks.filter((track) => selectedTrackIds.includes(track.id))
  const activeFilterCount = [formatFilter, likedOnly ? 'liked' : ''].filter(Boolean).length
  const hasSearch = Boolean(query.trim())
  const formatSummary = availableFormats.length ? availableFormats.join(' / ').toUpperCase() : '等待扫描'
  return (
    <section className="library-pane songs-workspace" aria-label="歌曲库">
      <div className="songs-hero">
        <div className="songs-hero-copy">
          <span className="eyebrow">歌曲工作区</span>
          <h2>{hasSearch ? `搜索“${query.trim()}”` : '从整座曲库开始'}</h2>
          <p>
            {hasSearch
              ? `找到 ${tracks.length} 首匹配歌曲。结果会跟随全局搜索实时更新。`
              : `已索引 ${totalTracks} 首歌曲，保留桌面表格的效率，同时把启动播放、筛选和结果状态放在最前面。`}
          </p>
          {playerError && <em className="inline-error">{playerError}</em>}
          <div className="songs-hero-actions">
            <button type="button" className="primary-button" onClick={() => onPlayAll(tracks)} disabled={!tracks.length}>
              <Play size={17} fill="currentColor" />
              播放全部
            </button>
            <button type="button" className="secondary-button" onClick={() => onShuffleAll(tracks)} disabled={!tracks.length}>
              <Shuffle size={17} />
              随机播放
            </button>
          </div>
        </div>

        <div className="songs-filter-summary" aria-label="浏览摘要">
          <div>
            <strong>{tracks.length}</strong>
            <span>{hasSearch ? '搜索结果' : '当前可播放'}</span>
          </div>
          <div>
            <strong>{activeFilterCount}</strong>
            <span>启用筛选</span>
          </div>
          <div>
            <strong>{selectedTrackIds.length}</strong>
            <span>已选歌曲</span>
          </div>
          <p title={formatSummary}>格式：{formatSummary}</p>
          {(formatFilter || likedOnly) && (
            <p>
              已限制为{formatFilter ? ` ${formatFilter.toUpperCase()}` : ''}{likedOnly ? ' 我喜欢' : ''}
            </p>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <h3>全部歌曲</h3>
          <span>{tracks.length} / {totalTracks} 首</span>
        </div>

        <TrackFilterBar
          sortField={sortField}
          formatFilter={formatFilter}
          likedOnly={likedOnly}
          availableFormats={availableFormats}
          onSortFieldChange={onSortFieldChange}
          onFormatFilterChange={onFormatFilterChange}
          onLikedOnlyChange={onLikedOnlyChange}
        />

        {selectedTracks.length > 0 && (
          <TrackListToolbar
            tracks={tracks}
            selectedTracks={selectedTracks}
            canRemove={false}
            canClear={false}
            showPlayAll={false}
            onPlayAll={onPlayAll}
            onPlaySelected={onPlaySelected}
            onPlayNextTracks={onPlayNextTracks}
            onOpenPlaylistDialogForTracks={onOpenPlaylistDialogForTracks}
            onBatchLike={onBatchLike}
          />
        )}

        <PlaylistTrackTable
          tracks={tracks}
          selectedTrackIds={selectedTrackIds}
          selectedTrack={selectedTrack}
          currentTrack={currentTrack}
          playbackStatus={playbackStatus}
          onSelectTrack={onSelectTrack}
          onToggleTrackSelected={onToggleTrackSelected}
          onToggleAllTracks={onToggleAllTracks}
          onPlayTrack={onPlayTrack}
          onToggleLike={onToggleLike}
          onToggleMenu={onToggleMenu}
          onOpenPlaylistDialog={onOpenPlaylistDialog}
          onPlayNext={onPlayNext}
          openTrackMenuId={openTrackMenuId}
        />

        {isLoading && <StateMessage title="正在读取歌曲库" body="稍等一下，聆听正在同步本地媒体库。" />}
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
  selectedTrackIds,
  onNameChange,
  onSubmit,
  onSelectPlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onSelectTrack,
  onToggleTrackSelected,
  onToggleAllTracks,
  onPlayAll,
  onPlaySelected,
  onPlayTrack,
  onToggleLike,
  onBatchLike,
  onToggleMenu,
  onOpenPlaylistDialog,
  onOpenPlaylistDialogForTracks,
  onPlayNext,
  onPlayNextTracks,
  onRemoveTrack,
  onRemoveTracks,
  openTrackMenuId,
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
  selectedTrackIds: number[]
  onNameChange: (name: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onSelectPlaylist: (id: number) => void
  onRenamePlaylist: (playlist: Playlist) => void
  onDeletePlaylist: (playlist: Playlist) => void
  onSelectTrack: (track: Track) => void
  onToggleTrackSelected: (track: Track, checked: boolean) => void
  onToggleAllTracks: (tracks: Track[], checked: boolean) => void
  onPlayAll: (tracks: Track[]) => void
  onPlaySelected: (tracks: Track[]) => void
  onPlayTrack: (track: Track) => void
  onToggleLike: (track: Track) => void
  onBatchLike: (tracks: Track[], liked: boolean) => void
  onToggleMenu: (track: Track) => void
  onOpenPlaylistDialog: (track: Track) => void
  onOpenPlaylistDialogForTracks: (tracks: Track[]) => void
  onPlayNext: (track: Track) => void
  onPlayNextTracks: (tracks: Track[]) => void
  onRemoveTrack: (track: Track) => void
  onRemoveTracks: (tracks: Track[]) => void
  openTrackMenuId: number | null
}) {
  const selectedTracks = tracks.filter((track) => selectedTrackIds.includes(track.id))
  const totalPlaylistTracks = playlists.reduce((count, playlist) => count + playlist.trackCount, 0)

  return (
    <section className="playlist-page playlist-workbench-page" aria-label="歌单管理">
      <aside className="playlist-workbench-sidebar">
        <form className="playlist-quiet-create" onSubmit={onSubmit}>
          <div>
            <span className="eyebrow">歌单架</span>
            <strong>新建普通歌单</strong>
          </div>
          <label htmlFor="playlist-name" className="sr-only">歌单名称</label>
          <div className="quick-create-row">
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

        <div className="playlist-sidebar-summary">
          <div>
            <strong>{playlists.length}</strong>
            <span>歌单</span>
          </div>
          <div>
            <strong>{totalPlaylistTracks}</strong>
            <span>收录</span>
          </div>
        </div>

        <div className="playlist-shelf-title">
          <span>歌单架</span>
          <small>{playlists.length} 个</small>
        </div>

        <div className="playlist-list workbench-playlist-list">
          {playlists.map((playlist, index) => (
            <button
              key={playlist.id}
              type="button"
              className={`playlist-item ${selectedPlaylist?.id === playlist.id ? 'active' : ''}`}
              onClick={() => onSelectPlaylist(playlist.id)}
            >
              <i aria-hidden="true">{String(index + 1).padStart(2, '0')}</i>
              <span>
                <strong>{playlist.name}</strong>
                <small>{playlist.trackCount} 首歌曲</small>
              </span>
            </button>
          ))}
        </div>

        {!playlists.length && !isLoading && <StateMessage title="还没有普通歌单" body="输入名称创建第一个听歌场景。" />}
      </aside>

      <div className="playlist-detail playlist-workbench-detail">
        <div className="playlist-workbench-status">
          <span>正在整理</span>
          <strong>{selectedTrackIds.length ? `已选 ${selectedTrackIds.length} 首` : '未选择歌曲'}</strong>
        </div>

        <div className="playlist-detail-heading">
          <div>
            <h3>{selectedPlaylist?.name ?? '选择一个歌单'}</h3>
            <p>{selectedPlaylist ? `${tracks.length} 首歌曲 · 当前歌单工作台` : '左侧选择歌单后，在这里播放、重命名或整理歌曲。'}</p>
          </div>
          {selectedPlaylist && (
            <div className="row-actions playlist-actions">
              <button type="button" className="primary-button" onClick={() => onPlayAll(tracks)} disabled={!tracks.length} title="播放歌单" aria-label="播放歌单">
                <Play size={15} fill="currentColor" />
                播放
              </button>
              <button type="button" onClick={() => onRenamePlaylist(selectedPlaylist)} disabled={isMutating} title="重命名" aria-label="重命名">
                <RefreshCw size={15} />
              </button>
              <button type="button" className="danger" onClick={() => onDeletePlaylist(selectedPlaylist)} disabled={isMutating} title="删除歌单" aria-label="删除歌单">
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </div>

        <TrackListToolbar
          tracks={tracks}
          selectedTracks={selectedTracks}
          canRemove={Boolean(selectedPlaylist)}
          canClear={false}
          onPlayAll={onPlayAll}
          onPlaySelected={onPlaySelected}
          onPlayNextTracks={onPlayNextTracks}
          onOpenPlaylistDialogForTracks={onOpenPlaylistDialogForTracks}
          onBatchLike={onBatchLike}
          onRemoveTracks={onRemoveTracks}
        />

        <PlaylistTrackTable
          tracks={tracks}
          selectedTrackIds={selectedTrackIds}
          selectedTrack={selectedTrack}
          currentTrack={currentTrack}
          playbackStatus={playbackStatus}
          onSelectTrack={onSelectTrack}
          onToggleTrackSelected={onToggleTrackSelected}
          onToggleAllTracks={onToggleAllTracks}
          onPlayTrack={onPlayTrack}
          onToggleLike={onToggleLike}
          onToggleMenu={onToggleMenu}
          onOpenPlaylistDialog={onOpenPlaylistDialog}
          onPlayNext={onPlayNext}
          onRemoveTrack={onRemoveTrack}
          openTrackMenuId={openTrackMenuId}
        />

        {isLoading && <StateMessage title="正在读取歌单" body="稍等一下，聆听正在同步歌单数据。" />}
        {isError && <StateMessage title="歌单加载失败" body="请确认后端服务已启动，然后刷新页面。" tone="error" />}
        {selectedPlaylist && !isLoading && !isError && !tracks.length && <StateMessage title="这个歌单还是空的" body="从歌曲列表的三点菜单中添加歌曲到歌单。" />}
      </div>
    </section>
  )
}

function LikedTracksView({
  tracks,
  selectedTrack,
  currentTrack,
  playbackStatus,
  selectedTrackIds,
  isLoading,
  isError,
  openTrackMenuId,
  onSelectTrack,
  onToggleTrackSelected,
  onToggleAllTracks,
  onPlayAll,
  onShuffleAll,
  onPlaySelected,
  onPlayTrack,
  onToggleLike,
  onBatchLike,
  onToggleMenu,
  onOpenPlaylistDialog,
  onOpenPlaylistDialogForTracks,
  onPlayNext,
  onPlayNextTracks,
}: {
  tracks: Track[]
  selectedTrack: Track | null
  currentTrack: Track | null
  playbackStatus: PlaybackStatus
  selectedTrackIds: number[]
  isLoading: boolean
  isError: boolean
  openTrackMenuId: number | null
  onSelectTrack: (track: Track) => void
  onToggleTrackSelected: (track: Track, checked: boolean) => void
  onToggleAllTracks: (tracks: Track[], checked: boolean) => void
  onPlayAll: (tracks: Track[]) => void
  onShuffleAll: (tracks: Track[]) => void
  onPlaySelected: (tracks: Track[]) => void
  onPlayTrack: (track: Track) => void
  onToggleLike: (track: Track) => void
  onBatchLike: (tracks: Track[], liked: boolean) => void
  onToggleMenu: (track: Track) => void
  onOpenPlaylistDialog: (track: Track) => void
  onOpenPlaylistDialogForTracks: (tracks: Track[]) => void
  onPlayNext: (track: Track) => void
  onPlayNextTracks: (tracks: Track[]) => void
}) {
  const selectedTracks = tracks.filter((track) => selectedTrackIds.includes(track.id))
  const likedArtists = new Set(tracks.map((track) => track.artist).filter(Boolean)).size

  return (
    <section className="system-playlist-page liked-page" aria-label="我喜欢">
      <div className="liked-hero">
        <div className="liked-hero-copy">
          <span className="eyebrow">收藏集合</span>
          <h2>我喜欢的声音</h2>
          <p>这里是你主动点亮的歌曲集合。主操作保持简单：直接播放、随机播放，或把不再喜欢的歌移出收藏。</p>
          <div className="songs-hero-actions">
            <button type="button" className="primary-button" onClick={() => onPlayAll(tracks)} disabled={!tracks.length}>
              <Play size={17} fill="currentColor" />
              播放收藏
            </button>
            <button type="button" className="secondary-button" onClick={() => onShuffleAll(tracks)} disabled={!tracks.length}>
              <Shuffle size={17} />
              随机播放
            </button>
            <button type="button" className="secondary-button danger-soft" onClick={() => onBatchLike(tracks, false)} disabled={!tracks.length}>
              <Heart size={17} />
              全部取消喜欢
            </button>
          </div>
        </div>
        <div className="liked-summary" aria-label="收藏摘要">
          <div className="liked-heart"><Heart size={34} fill="currentColor" /></div>
          <div><strong>{tracks.length}</strong><span>收藏歌曲</span></div>
          <div><strong>{likedArtists}</strong><span>艺术家</span></div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <h3>收藏列表</h3>
          <span>{tracks.length} 首</span>
        </div>
        {selectedTracks.length > 0 && (
          <TrackListToolbar
            tracks={tracks}
            selectedTracks={selectedTracks}
            canRemove={false}
            canClear={false}
            showPlayAll={false}
            onPlayAll={onPlayAll}
            onPlaySelected={onPlaySelected}
            onPlayNextTracks={onPlayNextTracks}
            onOpenPlaylistDialogForTracks={onOpenPlaylistDialogForTracks}
            onBatchLike={onBatchLike}
          />
        )}
        <PlaylistTrackTable
          tracks={tracks}
          selectedTrackIds={selectedTrackIds}
          selectedTrack={selectedTrack}
          currentTrack={currentTrack}
          playbackStatus={playbackStatus}
          onSelectTrack={onSelectTrack}
          onToggleTrackSelected={onToggleTrackSelected}
          onToggleAllTracks={onToggleAllTracks}
          onPlayTrack={onPlayTrack}
          onToggleLike={onToggleLike}
          onToggleMenu={onToggleMenu}
          onOpenPlaylistDialog={onOpenPlaylistDialog}
          onPlayNext={onPlayNext}
          openTrackMenuId={openTrackMenuId}
        />
        {isLoading && <StateMessage title="正在读取我喜欢" body="稍等一下，聆听正在同步收藏集合。" />}
        {isError && <StateMessage title="我喜欢加载失败" body="请确认后端服务已启动，然后刷新页面。" tone="error" />}
        {!isLoading && !isError && !tracks.length && <StateMessage title="还没有喜欢的歌曲" body="在歌曲列表中点亮收藏按钮后，这里会显示它们。" />}
      </div>
    </section>
  )
}

function RecentPlaysView({
  items,
  selectedTrack,
  currentTrack,
  playbackStatus,
  selectedTrackIds,
  isLoading,
  isError,
  isClearing,
  openTrackMenuId,
  onSelectTrack,
  onToggleTrackSelected,
  onToggleAllTracks,
  onPlayAll,
  onPlaySelected,
  onPlayTrack,
  onToggleLike,
  onBatchLike,
  onToggleMenu,
  onOpenPlaylistDialog,
  onOpenPlaylistDialogForTracks,
  onPlayNext,
  onPlayNextTracks,
  onClearTracks,
}: {
  items: RecentTrackItem[]
  selectedTrack: Track | null
  currentTrack: Track | null
  playbackStatus: PlaybackStatus
  selectedTrackIds: number[]
  isLoading: boolean
  isError: boolean
  isClearing?: boolean
  openTrackMenuId: number | null
  onSelectTrack: (track: Track) => void
  onToggleTrackSelected: (track: Track, checked: boolean) => void
  onToggleAllTracks: (tracks: Track[], checked: boolean) => void
  onPlayAll: (tracks: Track[]) => void
  onPlaySelected: (tracks: Track[]) => void
  onPlayTrack: (track: Track) => void
  onToggleLike: (track: Track) => void
  onBatchLike: (tracks: Track[], liked: boolean) => void
  onToggleMenu: (track: Track) => void
  onOpenPlaylistDialog: (track: Track) => void
  onOpenPlaylistDialogForTracks: (tracks: Track[]) => void
  onPlayNext: (track: Track) => void
  onPlayNextTracks: (tracks: Track[]) => void
  onClearTracks: () => void
}) {
  const tracks = items.map((item) => item.track)
  const selectedTracks = tracks.filter((track) => selectedTrackIds.includes(track.id))
  const latestItem = items[0]

  return (
    <section className="system-playlist-page recent-page" aria-label="最近播放">
      <div className="recent-hero">
        <div>
          <span className="eyebrow">最近播放</span>
          <h2>按你刚听过的顺序继续</h2>
          <p>
            {latestItem
              ? `最新一次播放：${formatPlayedAt(latestItem.lastPlayedAt)} · ${latestItem.track.title}`
              : '歌曲真正开始播放后，会自动更新到这里。'}
          </p>
        </div>
        <div className="recent-timeline" aria-label="最近播放时间">
          {items.slice(0, 4).map((item) => (
            <article key={`${item.track.id}-${item.lastPlayedAt}`}>
              <strong>{item.track.title}</strong>
              <span>{formatPlayedAt(item.lastPlayedAt)}</span>
            </article>
          ))}
          {!items.length && <p>还没有播放记录</p>}
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <h3>最新在上方</h3>
          <span>{tracks.length} 首</span>
        </div>
        <TrackListToolbar
          tracks={tracks}
          selectedTracks={selectedTracks}
          canRemove={false}
          canClear
          isClearing={isClearing}
          onPlayAll={onPlayAll}
          onPlaySelected={onPlaySelected}
          onPlayNextTracks={onPlayNextTracks}
          onOpenPlaylistDialogForTracks={onOpenPlaylistDialogForTracks}
          onBatchLike={onBatchLike}
          onClearTracks={onClearTracks}
        />
        <PlaylistTrackTable
          tracks={tracks}
          selectedTrackIds={selectedTrackIds}
          selectedTrack={selectedTrack}
          currentTrack={currentTrack}
          playbackStatus={playbackStatus}
          onSelectTrack={onSelectTrack}
          onToggleTrackSelected={onToggleTrackSelected}
          onToggleAllTracks={onToggleAllTracks}
          onPlayTrack={onPlayTrack}
          onToggleLike={onToggleLike}
          onToggleMenu={onToggleMenu}
          onOpenPlaylistDialog={onOpenPlaylistDialog}
          onPlayNext={onPlayNext}
          openTrackMenuId={openTrackMenuId}
        />
        {isLoading && <StateMessage title="正在读取最近播放" body="稍等一下，聆听正在同步播放记录。" />}
        {isError && <StateMessage title="最近播放加载失败" body="请确认后端服务已启动，然后刷新页面。" tone="error" />}
        {!isLoading && !isError && !tracks.length && <StateMessage title="还没有最近播放" body="开始播放任意歌曲后，这里会展示最近听过的内容。" />}
      </div>
    </section>
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

        {isLoading && <StateMessage title="正在读取媒体库" body="稍等一下，聆听正在同步媒体库目录。" />}
        {isError && <StateMessage title="媒体库加载失败" body="请确认后端服务已启动，然后刷新页面。" tone="error" />}
        {!isLoading && !isError && !libraries.length && (
          <StateMessage title="还没有媒体库" body="添加一个音乐目录后，聆听会自动开始第一次扫描。" />
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

function viewTitle(view: ViewMode) {
  switch (view) {
    case 'libraries':
      return '媒体库'
    case 'songs':
      return '歌曲'
    case 'playlists':
      return '歌单'
    case 'liked':
      return '我喜欢'
    case 'recent':
      return '最近播放'
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default App
