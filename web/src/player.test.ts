import { describe, expect, test } from 'vitest'
import {
  getNextPlayMode,
  getNextQueueTrack,
  insertTracksAfterCurrent,
  readStoredPlayerState,
  writeStoredPlayerState,
  type PlayMode,
} from './player'
import type { Track } from './api'

const tracks: Track[] = [
  track(1, '雨后街灯'),
  track(2, 'Nocturne in C Minor'),
  track(3, '海盐汽水'),
]

describe('player logic', () => {
  test('cycles play modes in product order', () => {
    const modes: PlayMode[] = ['sequence', 'loop', 'shuffle', 'single']

    expect(modes.map(getNextPlayMode)).toEqual(['loop', 'shuffle', 'single', 'sequence'])
  })

  test('returns next queue track by mode', () => {
    expect(getNextQueueTrack({ queue: tracks, currentTrack: tracks[0], playMode: 'sequence' })).toBe(tracks[1])
    expect(getNextQueueTrack({ queue: tracks, currentTrack: tracks[2], playMode: 'sequence' })).toBeNull()
    expect(getNextQueueTrack({ queue: tracks, currentTrack: tracks[2], playMode: 'loop' })).toBe(tracks[0])
    expect(getNextQueueTrack({ queue: tracks, currentTrack: tracks[1], playMode: 'single' })).toBe(tracks[1])
  })

  test('uses injected random source for shuffle without repeating current when possible', () => {
    expect(getNextQueueTrack({ queue: tracks, currentTrack: tracks[0], playMode: 'shuffle', random: () => 0.99 })).toBe(tracks[2])
  })

  test('inserts tracks after current while deduplicating existing queue items', () => {
    expect(insertTracksAfterCurrent({ queue: tracks, currentTrack: tracks[0], tracksToInsert: [tracks[2], tracks[1]] })).toEqual([
      tracks[0],
      tracks[2],
      tracks[1],
    ])
  })

  test('appends inserted tracks when current track is not in queue', () => {
    expect(insertTracksAfterCurrent({ queue: [tracks[0]], currentTrack: tracks[2], tracksToInsert: [tracks[1]] })).toEqual([tracks[0], tracks[1]])
  })

  test('stores player state under the Lingting key and reads legacy Ayan state as fallback', () => {
    const storage = new MemoryStorage()
    storage.setItem('ayan.player.v1', JSON.stringify({ volume: 101, playMode: 'shuffle', queueTrackIds: [1, 'x', 2], currentTrackId: 2 }))

    expect(readStoredPlayerState(storage)).toEqual({
      volume: 100,
      playMode: 'shuffle',
      queueTrackIds: [1, 2],
      currentTrackId: 2,
    })

    writeStoredPlayerState(
      {
        volume: 48,
        playMode: 'single',
        queueTrackIds: [3],
        currentTrackId: 3,
      },
      storage,
    )

    expect(JSON.parse(storage.getItem('lingting.player.v1') ?? '{}')).toEqual({
      volume: 48,
      playMode: 'single',
      queueTrackIds: [3],
      currentTrackId: 3,
    })
  })
})

function track(id: number, title: string): Track {
  return {
    id,
    title,
    path: `/music/${id}.flac`,
    artist: '',
    album: '',
    durationMs: id * 1000,
    format: 'flac',
    liked: false,
  }
}

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>()

  get length() {
    return this.items.size
  }

  clear() {
    this.items.clear()
  }

  getItem(key: string) {
    return this.items.get(key) ?? null
  }

  key(index: number) {
    return Array.from(this.items.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.items.delete(key)
  }

  setItem(key: string, value: string) {
    this.items.set(key, value)
  }
}
