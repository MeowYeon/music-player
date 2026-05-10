import type { Track } from './api'

export const playerStorageKey = 'lingting.player.v1'
const legacyPlayerStorageKey = 'ayan.player.v1'

export type PlayMode = 'sequence' | 'loop' | 'shuffle' | 'single'

export type StoredPlayerState = {
  volume?: number
  playMode?: PlayMode
  queueTrackIds?: number[]
  currentTrackId?: number | null
}

export function getNextPlayMode(mode: PlayMode): PlayMode {
  return mode === 'sequence' ? 'loop' : mode === 'loop' ? 'shuffle' : mode === 'shuffle' ? 'single' : 'sequence'
}

export function getNextQueueTrack({
  queue,
  currentTrack,
  playMode,
  random = Math.random,
}: {
  queue: Track[]
  currentTrack: Track | null
  playMode: PlayMode
  random?: () => number
}) {
  if (playMode === 'single') {
    return currentTrack
  }
  if (!queue.length) {
    return null
  }
  const index = currentTrack ? queue.findIndex((track) => track.id === currentTrack.id) : -1
  if (playMode === 'shuffle') {
    if (queue.length === 1) {
      return queue[0]
    }
    const candidates = queue.filter((track) => track.id !== currentTrack?.id)
    return candidates[Math.floor(random() * candidates.length)] ?? null
  }
  if (index >= 0 && index < queue.length - 1) {
    return queue[index + 1]
  }
  if (playMode === 'loop') {
    return queue[0]
  }
  return null
}

export function insertTracksAfterCurrent({
  queue,
  currentTrack,
  tracksToInsert,
}: {
  queue: Track[]
  currentTrack: Track | null
  tracksToInsert: Track[]
}) {
  const trackIDs = new Set(tracksToInsert.map((track) => track.id))
  const withoutTracks = queue.filter((item) => !trackIDs.has(item.id))
  const currentQueueIndex = currentTrack ? withoutTracks.findIndex((item) => item.id === currentTrack.id) : -1
  if (currentQueueIndex < 0) {
    return [...withoutTracks, ...tracksToInsert]
  }
  return [...withoutTracks.slice(0, currentQueueIndex + 1), ...tracksToInsert, ...withoutTracks.slice(currentQueueIndex + 1)]
}

export function readStoredPlayerState(storage: Storage = window.localStorage): StoredPlayerState {
  try {
    const raw = storage.getItem(playerStorageKey) ?? storage.getItem(legacyPlayerStorageKey)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as StoredPlayerState
    return normalizeStoredPlayerState(parsed)
  } catch {
    return {}
  }
}

export function writeStoredPlayerState(state: StoredPlayerState, storage: Storage = window.localStorage) {
  storage.setItem(playerStorageKey, JSON.stringify(state))
}

function normalizeStoredPlayerState(parsed: StoredPlayerState): StoredPlayerState {
  return {
    volume: typeof parsed.volume === 'number' ? clampVolume(parsed.volume) : undefined,
    playMode: isPlayMode(parsed.playMode) ? parsed.playMode : undefined,
    queueTrackIds: Array.isArray(parsed.queueTrackIds) ? parsed.queueTrackIds.filter((id) => typeof id === 'number') : undefined,
    currentTrackId: typeof parsed.currentTrackId === 'number' ? parsed.currentTrackId : null,
  }
}

function clampVolume(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function isPlayMode(value: unknown): value is PlayMode {
  return value === 'sequence' || value === 'loop' || value === 'shuffle' || value === 'single'
}
