import type { RecentTrackItem, Track } from './api'
import type { ViewMode } from './App'

export function shouldJumpToSongsForGlobalSearch(view: ViewMode, value: string) {
  return view !== 'songs' && value.trim().length > 0
}

export function shouldShowBatchActions(selectedTrackCount: number) {
  return selectedTrackCount > 0
}

export function recentItemsToTracks(items: RecentTrackItem[]): Track[] {
  return items.map((item) => item.track)
}

export function calculateLibraryProgress(scannedFiles: number, totalFiles: number) {
  if (totalFiles <= 0) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round((scannedFiles / totalFiles) * 100)))
}
