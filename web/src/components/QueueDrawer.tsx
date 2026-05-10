import { X } from 'lucide-react'
import type { Track } from '../api'
import type { PlayMode } from '../player'
import { formatDuration, playbackLabel, playModeLabel, type PlaybackStatus } from '../playback'
import { displayArtist } from '../tracks'

export function QueueDrawer({
  queue,
  currentTrack,
  playbackStatus,
  playMode,
  onClose,
  onPlayTrack,
  onRemoveTrack,
}: {
  queue: Track[]
  currentTrack: Track | null
  playbackStatus: PlaybackStatus
  playMode: PlayMode
  onClose: () => void
  onPlayTrack: (track: Track) => void
  onRemoveTrack: (track: Track) => void
}) {
  const upcoming = currentTrack ? queue.filter((track) => track.id !== currentTrack.id) : queue
  return (
    <aside className="queue-drawer" aria-label="播放队列">
      <div className="queue-header">
        <div>
          <h2>播放队列</h2>
          <p>
            {queue.length} 首 · {playModeLabel(playMode)}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭播放队列" title="关闭">
          <X size={18} />
        </button>
      </div>

      <section className="queue-section">
        <span className="eyebrow">当前播放</span>
        {currentTrack ? (
          <button type="button" className="queue-track current" onClick={() => onPlayTrack(currentTrack)}>
            <strong>{currentTrack.title}</strong>
            <small>
              {displayArtist(currentTrack)} · {playbackLabel(playbackStatus)}
            </small>
          </button>
        ) : (
          <p className="queue-empty">还没有选择歌曲</p>
        )}
      </section>

      <section className="queue-section queue-section-upcoming">
        <span className="eyebrow">接下来</span>
        <div className="queue-list">
          {upcoming.map((track) => (
            <div className="queue-track-row" key={track.id}>
              <button type="button" className="queue-track" onClick={() => onPlayTrack(track)}>
                <strong>{track.title}</strong>
                <small>
                  {displayArtist(track)} · {formatDuration(track.durationMs)}
                </small>
              </button>
              <button type="button" aria-label="移出队列" title="移出队列" onClick={() => onRemoveTrack(track)}>
                <X size={15} />
              </button>
            </div>
          ))}
          {!upcoming.length && <p className="queue-empty">没有后续歌曲</p>}
        </div>
      </section>
    </aside>
  )
}
