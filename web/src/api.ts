export type ScanStatus = 'idle' | 'waiting' | 'running' | 'completed' | 'failed'

export type LibrarySummary = {
  rootCount: number
  trackCount: number
  latestScanStatus: ScanStatus
}

export type ScanTask = {
  id: number
  libraryId: number
  status: ScanStatus
  totalFiles: number
  scannedFiles: number
  message?: string
  completedAt?: string
}

export type LibraryItem = {
  id: number
  path: string
  musicCount: number
  createdAt: string
  updatedAt: string
  scan: ScanTask
}

export type Track = {
  id: number
  path: string
  title: string
  artist: string
  album: string
  durationMs: number
  format: string
}

export type CreateLibraryRequest = {
  path: string
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
const useMocks = import.meta.env.VITE_USE_MOCKS === 'true'

const mockTracks: Track[] = [
  {
    id: 1,
    path: '/mnt/c/Users/guohp/Music/test/雨后街灯.flac',
    title: '雨后街灯',
    artist: '林野',
    album: '城市慢拍',
    durationMs: 247000,
    format: 'flac',
  },
  {
    id: 2,
    path: '/mnt/c/Users/guohp/Music/test/Nocturne in C Minor.mp3',
    title: 'Nocturne in C Minor',
    artist: 'Mira Vale',
    album: 'Quiet Hours',
    durationMs: 312000,
    format: 'mp3',
  },
  {
    id: 3,
    path: '/home/ghp/Music/海盐汽水.m4a',
    title: '海盐汽水',
    artist: '夏末合唱团',
    album: '日光练习',
    durationMs: 221000,
    format: 'm4a',
  },
]

const mockLibraries: LibraryItem[] = [
  {
    id: 1,
    path: '/mnt/c/Users/guohp/Music/test',
    musicCount: 3,
    createdAt: '今天 14:18',
    updatedAt: '今天 14:18',
    scan: {
      id: 1,
      libraryId: 1,
      status: 'running',
      totalFiles: 342,
      scannedFiles: 128,
    },
  },
  {
    id: 2,
    path: '/home/ghp/Music',
    musicCount: 125,
    createdAt: '昨天 21:04',
    updatedAt: '昨天 21:05',
    scan: {
      id: 2,
      libraryId: 2,
      status: 'completed',
      totalFiles: 125,
      scannedFiles: 125,
      message: '媒体库已是最新，无需重新导入',
      completedAt: '昨天 21:05',
    },
  },
]

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  if (!response.ok) {
    let message = `Request failed: ${response.status}`
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) {
        message = payload.error
      }
    } catch {
      // Keep the status-based fallback when the response is not JSON.
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

async function withMockFallback<T>(realRequest: () => Promise<T>, mockValue: T): Promise<T> {
  if (useMocks) {
    return mockValue
  }

  return realRequest()
}

export async function getLibrarySummary(): Promise<LibrarySummary> {
  return withMockFallback(() => request<LibrarySummary>('/api/library'), {
    rootCount: mockLibraries.length,
    trackCount: mockTracks.length,
    latestScanStatus: 'running',
  })
}

export async function getLibraries(): Promise<LibraryItem[]> {
  return withMockFallback(() => request<LibraryItem[]>('/api/libraries'), mockLibraries)
}

export async function createLibrary(payload: CreateLibraryRequest): Promise<LibraryItem> {
  return withMockFallback(
    () =>
      request<LibraryItem>('/api/libraries', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    {
      id: Date.now(),
      path: payload.path,
      musicCount: 0,
      createdAt: '刚刚',
      updatedAt: '刚刚',
      scan: {
        id: Date.now(),
        libraryId: Date.now(),
        status: 'idle',
        totalFiles: 0,
        scannedFiles: 0,
      },
    },
  )
}

export async function deleteLibrary(libraryId: number): Promise<void> {
  if (useMocks) {
    return
  }

  await request<void>(`/api/libraries/${libraryId}`, {
    method: 'DELETE',
  })
}

export async function scanLibrary(libraryId: number): Promise<ScanTask> {
  return withMockFallback(
    () =>
      request<ScanTask>(`/api/libraries/${libraryId}/scan`, {
        method: 'POST',
      }),
    {
      id: Date.now(),
      libraryId,
      status: 'waiting',
      totalFiles: 0,
      scannedFiles: 0,
    },
  )
}

export async function getActiveScanTasks(): Promise<ScanTask[]> {
  return withMockFallback(
    () => request<ScanTask[]>('/api/scan-tasks/active'),
    mockLibraries.map((library) => library.scan).filter((scan) => scan.status === 'waiting' || scan.status === 'running'),
  )
}

export async function getTracks(query: string): Promise<Track[]> {
  return withMockFallback(() => request<Track[]>(`/api/tracks?q=${encodeURIComponent(query)}`), filterTracks(query))
}

export function getTrackStreamUrl(trackId: number): string {
  return `${apiBaseUrl}/api/tracks/${trackId}/stream`
}

function filterTracks(query: string): Track[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return mockTracks
  }

  return mockTracks.filter((track) =>
    [track.title, track.artist, track.album, track.format, track.path].some((value) => value.toLowerCase().includes(normalized)),
  )
}
