import type { Track } from './api'

export type TrackSortField = 'title' | 'artist' | 'album' | 'duration' | 'format'

export function sortTracks(tracks: Track[], field: TrackSortField) {
  return [...tracks].sort((a, b) => {
    if (field === 'duration') {
      return a.durationMs - b.durationMs || compareText(a.title, b.title)
    }
    if (field === 'artist' || field === 'album') {
      const aMissing = !trackRawSortValue(a, field).trim()
      const bMissing = !trackRawSortValue(b, field).trim()
      if (aMissing !== bMissing) {
        return aMissing ? 1 : -1
      }
    }
    return compareText(trackSortValue(a, field), trackSortValue(b, field)) || compareText(a.title, b.title)
  })
}

export function displayArtist(track: Track) {
  return track.artist?.trim() || '未知艺术家'
}

export function displayAlbum(track: Track) {
  return track.album?.trim() || '未知专辑'
}

function trackSortValue(track: Track, field: TrackSortField) {
  switch (field) {
    case 'title':
      return track.title
    case 'artist':
      return displayArtist(track)
    case 'album':
      return displayAlbum(track)
    case 'format':
      return track.format
    case 'duration':
      return String(track.durationMs)
  }
}

function trackRawSortValue(track: Track, field: TrackSortField) {
  switch (field) {
    case 'artist':
      return track.artist
    case 'album':
      return track.album
    case 'title':
      return track.title
    case 'format':
      return track.format
    case 'duration':
      return String(track.durationMs)
  }
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, 'zh-Hans-CN', { sensitivity: 'base', numeric: true })
}
