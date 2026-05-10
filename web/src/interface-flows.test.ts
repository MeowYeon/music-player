import { describe, expect, test } from 'vitest'
import type { RecentTrackItem, Track } from './api'
import {
  calculateLibraryProgress,
  recentItemsToTracks,
  shouldJumpToSongsForGlobalSearch,
  shouldShowBatchActions,
} from './interface-flows'

describe('v0.6 interface flows', () => {
  test('global search jumps non-song pages into the songs workspace result state', () => {
    expect(shouldJumpToSongsForGlobalSearch('playlists', '雨后')).toBe(true)
    expect(shouldJumpToSongsForGlobalSearch('liked', '  ')).toBe(false)
    expect(shouldJumpToSongsForGlobalSearch('songs', '雨后')).toBe(false)
  })

  test('batch actions are only visible after selecting tracks', () => {
    expect(shouldShowBatchActions(0)).toBe(false)
    expect(shouldShowBatchActions(2)).toBe(true)
  })

  test('recent API items preserve newest-first track mapping with time metadata outside Track', () => {
    const first = track(1, '最新')
    const second = track(2, '稍早')
    const items: RecentTrackItem[] = [
      { track: first, lastPlayedAt: '2026-05-10T10:00:00.000Z' },
      { track: second, lastPlayedAt: '2026-05-10T09:00:00.000Z' },
    ]

    expect(recentItemsToTracks(items)).toEqual([first, second])
    expect(items[0].lastPlayedAt).toMatch(/^2026-05-10T10:/)
  })

  test('library cards clamp scan progress for empty and over-complete states', () => {
    expect(calculateLibraryProgress(0, 0)).toBe(0)
    expect(calculateLibraryProgress(25, 100)).toBe(25)
    expect(calculateLibraryProgress(120, 100)).toBe(100)
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
