import { describe, expect, test } from 'vitest'
import type { Track } from './api'
import { sortTracks, type TrackSortField } from './tracks'

const tracks: Track[] = [
  track({ id: 1, title: 'B Side', artist: '', album: 'Gamma', durationMs: 3000, format: 'mp3' }),
  track({ id: 2, title: 'A Side', artist: '林野', album: '', durationMs: 1000, format: 'flac' }),
  track({ id: 3, title: 'C Side', artist: 'Mira Vale', album: 'Alpha', durationMs: 2000, format: 'm4a' }),
]

describe('track sorting', () => {
  test.each([
    ['title', ['A Side', 'B Side', 'C Side']],
    ['artist', ['A Side', 'C Side', 'B Side']],
    ['album', ['C Side', 'B Side', 'A Side']],
    ['duration', ['A Side', 'C Side', 'B Side']],
    ['format', ['A Side', 'C Side', 'B Side']],
  ] satisfies Array<[TrackSortField, string[]]>)('sorts by %s', (field, expectedTitles) => {
    expect(sortTracks(tracks, field).map((item) => item.title)).toEqual(expectedTitles)
  })

  test('does not mutate the input list', () => {
    const original = tracks.map((item) => item.id)

    sortTracks(tracks, 'duration')

    expect(tracks.map((item) => item.id)).toEqual(original)
  })
})

function track(overrides: Partial<Track> & Pick<Track, 'id' | 'title'>): Track {
  return {
    path: `/music/${overrides.id}.flac`,
    artist: '',
    album: '',
    durationMs: 0,
    format: 'flac',
    liked: false,
    ...overrides,
  }
}
