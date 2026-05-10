import { Heart, MoreHorizontal, Play } from 'lucide-react'
import { formatDuration, type PlaybackStatus } from '../playback'
import { displayAlbum, displayArtist, type TrackSortField } from '../tracks'
import type { Track } from '../api'

export function TrackFilterBar({
  sortField,
  formatFilter,
  likedOnly,
  availableFormats,
  onSortFieldChange,
  onFormatFilterChange,
  onLikedOnlyChange,
}: {
  sortField: TrackSortField
  formatFilter: string
  likedOnly: boolean
  availableFormats: string[]
  onSortFieldChange: (field: TrackSortField) => void
  onFormatFilterChange: (format: string) => void
  onLikedOnlyChange: (likedOnly: boolean) => void
}) {
  return (
    <div className="track-filter-bar">
      <label>
        排序
        <select value={sortField} onChange={(event) => onSortFieldChange(event.target.value as TrackSortField)}>
          <option value="title">标题</option>
          <option value="artist">艺术家</option>
          <option value="album">专辑</option>
          <option value="duration">时长</option>
          <option value="format">格式</option>
        </select>
      </label>
      <label>
        格式
        <select value={formatFilter} onChange={(event) => onFormatFilterChange(event.target.value)}>
          <option value="">全部</option>
          {availableFormats.map((format) => (
            <option key={format} value={format}>
              {format.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="inline-check">
        <input type="checkbox" checked={likedOnly} onChange={(event) => onLikedOnlyChange(event.target.checked)} />
        仅看我喜欢
      </label>
    </div>
  )
}

export function TrackListToolbar({
  tracks,
  selectedTracks,
  canRemove,
  canClear,
  showPlayAll = true,
  isClearing = false,
  onPlayAll,
  onPlaySelected,
  onPlayNextTracks,
  onOpenPlaylistDialogForTracks,
  onBatchLike,
  onRemoveTracks,
  onClearTracks,
}: {
  tracks: Track[]
  selectedTracks: Track[]
  canRemove: boolean
  canClear: boolean
  showPlayAll?: boolean
  isClearing?: boolean
  onPlayAll: (tracks: Track[]) => void
  onPlaySelected: (tracks: Track[]) => void
  onPlayNextTracks: (tracks: Track[]) => void
  onOpenPlaylistDialogForTracks: (tracks: Track[]) => void
  onBatchLike: (tracks: Track[], liked: boolean) => void
  onRemoveTracks?: (tracks: Track[]) => void
  onClearTracks?: () => void
}) {
  const hasSelection = selectedTracks.length > 0
  return (
    <div className={`track-toolbar ${hasSelection ? 'selection-toolbar' : ''}`}>
      {showPlayAll && (
        <button type="button" className="primary-button" disabled={!tracks.length} onClick={() => onPlayAll(tracks)}>
          <Play size={15} fill="currentColor" />
          播放全部
        </button>
      )}
      <span>{hasSelection ? `已选 ${selectedTracks.length} 首，批量操作已就绪` : '未选择歌曲'}</span>
      <button type="button" disabled={!hasSelection} onClick={() => onPlaySelected(selectedTracks)}>
        播放选中
      </button>
      <button type="button" disabled={!hasSelection} onClick={() => onPlayNextTracks(selectedTracks)}>
        下一首播放
      </button>
      <button type="button" disabled={!hasSelection} onClick={() => onOpenPlaylistDialogForTracks(selectedTracks)}>
        添加到歌单
      </button>
      <button type="button" disabled={!hasSelection} onClick={() => onBatchLike(selectedTracks, true)}>
        收藏
      </button>
      <button type="button" disabled={!hasSelection} onClick={() => onBatchLike(selectedTracks, false)}>
        取消收藏
      </button>
      {canRemove && (
        <button type="button" className="danger" disabled={!hasSelection || !onRemoveTracks} onClick={() => onRemoveTracks?.(selectedTracks)}>
          移出歌单
        </button>
      )}
      {canClear && (
        <button type="button" className="danger" disabled={!tracks.length || isClearing || !onClearTracks} onClick={onClearTracks}>
          清空最近播放
        </button>
      )}
    </div>
  )
}

export function PlaylistTrackTable({
  tracks,
  selectedTrackIds,
  selectedTrack,
  currentTrack,
  playbackStatus,
  onSelectTrack,
  onToggleTrackSelected,
  onToggleAllTracks,
  onPlayTrack,
  onToggleLike,
  onToggleMenu,
  onOpenPlaylistDialog,
  onPlayNext,
  onRemoveTrack,
  openTrackMenuId,
  getTrackSubtitle,
}: {
  tracks: Track[]
  selectedTrackIds: number[]
  selectedTrack: Track | null
  currentTrack: Track | null
  playbackStatus: PlaybackStatus
  onSelectTrack: (track: Track) => void
  onToggleTrackSelected: (track: Track, checked: boolean) => void
  onToggleAllTracks: (tracks: Track[], checked: boolean) => void
  onPlayTrack: (track: Track) => void
  onToggleLike: (track: Track) => void
  onToggleMenu: (track: Track) => void
  onOpenPlaylistDialog: (track: Track) => void
  onPlayNext: (track: Track) => void
  onRemoveTrack?: (track: Track) => void
  openTrackMenuId: number | null
  getTrackSubtitle?: (track: Track) => string
}) {
  const allSelected = tracks.length > 0 && tracks.every((track) => selectedTrackIds.includes(track.id))
  return (
    <div className="table-scroll">
      <table className="track-table">
        <colgroup>
          <col className="track-col-select" />
          <col className="track-col-title" />
          <col className="track-col-artist" />
          <col className="track-col-album" />
          <col className="track-col-duration" />
          <col className="track-col-format" />
          <col className="track-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) => onToggleAllTracks(tracks, event.target.checked)}
                aria-label="选择当前列表全部歌曲"
              />
            </th>
            <th>标题</th>
            <th>艺术家</th>
            <th>专辑</th>
            <th>时长</th>
            <th>格式</th>
            <th aria-label="操作"></th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track) => (
            <tr
              key={track.id}
              className={trackRowClass(track, selectedTrack, currentTrack, playbackStatus, selectedTrackIds.includes(track.id))}
              onClick={() => onSelectTrack(track)}
              onDoubleClick={() => onPlayTrack(track)}
            >
              <td>
                <input
                  type="checkbox"
                  checked={selectedTrackIds.includes(track.id)}
                  onChange={(event) => onToggleTrackSelected(track, event.target.checked)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`选择 ${track.title}`}
                />
              </td>
              <td className="track-title-cell" title={track.title}>
                <button
                  type="button"
                  className="row-icon-button play-row-button"
                  aria-label={`播放 ${track.title}`}
                  title="播放"
                  onClick={(event) => {
                    event.stopPropagation()
                    onPlayTrack(track)
                  }}
                >
                  <Play size={15} fill="currentColor" />
                </button>
                <div className="track-title-stack">
                  <button
                    type="button"
                    className="track-title"
                    onClick={(event) => {
                      event.stopPropagation()
                      onPlayTrack(track)
                    }}
                  >
                    {track.title}
                  </button>
                  <span>{getTrackSubtitle ? getTrackSubtitle(track) : `${displayArtist(track)} · ${displayAlbum(track)}`}</span>
                </div>
              </td>
              <td className={`artist-cell soft-text-cell ${!track.artist ? 'muted-cell' : ''}`} title={displayArtist(track)}>{displayArtist(track)}</td>
              <td className={`album-cell soft-text-cell ${!track.album ? 'muted-cell' : ''}`} title={displayAlbum(track)}>{displayAlbum(track)}</td>
              <td className="duration-cell"><span>{formatDuration(track.durationMs)}</span></td>
              <td className="format-cell">
                <span className="format-chip">{track.format}</span>
              </td>
              <td className="track-actions-cell">
                <button
                  type="button"
                  className={`row-icon-button like-row-button ${track.liked ? 'liked' : ''}`}
                  aria-label={track.liked ? '取消喜欢' : '加入我喜欢'}
                  title={track.liked ? '取消喜欢' : '加入我喜欢'}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleLike(track)
                  }}
                >
                  <Heart size={15} fill={track.liked ? 'currentColor' : 'none'} />
                </button>
                <button
                  type="button"
                  className="row-icon-button"
                  aria-label="更多操作"
                  title="更多操作"
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleMenu(track)
                  }}
                >
                  <MoreHorizontal size={16} />
                </button>
                {openTrackMenuId === track.id && (
                  <div className="track-menu" onClick={(event) => event.stopPropagation()}>
                    <button type="button" onClick={() => onOpenPlaylistDialog(track)}>
                      添加到歌单
                    </button>
                    <button type="button" onClick={() => onPlayNext(track)}>
                      下一首播放
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(track.path)
                        onToggleMenu(track)
                      }}
                    >
                      复制路径
                    </button>
                    {onRemoveTrack && (
                      <button type="button" onClick={() => onRemoveTrack(track)}>
                        移出歌单
                      </button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function StateMessage({ title, body, tone = 'default' }: { title: string; body: string; tone?: 'default' | 'error' }) {
  return (
    <div className={`empty-state ${tone}`}>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  )
}

function trackRowClass(track: Track, selectedTrack: Track | null, currentTrack: Track | null, status: PlaybackStatus, checked: boolean) {
  const classes: string[] = []
  if (checked) {
    classes.push('checked')
  }
  if (selectedTrack?.id === track.id) {
    classes.push('selected')
  }
  if (currentTrack?.id === track.id) {
    classes.push('current', status)
  }
  return classes.join(' ') || undefined
}
