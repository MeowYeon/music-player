export type LibrarySummary = {
  rootCount: number
  trackCount: number
  latestScanStatus: ScanJob['status']
}

export type Track = {
  id: number
  title: string
  artist: string
  album: string
  durationMs: number
  format: string
  path?: string
}

export type ScanJob = {
  id: number
  path: string
  status: 'waiting' | 'running' | 'completed' | 'failed'
  totalFiles: number
  scannedFiles: number
  errorMessage?: string
  startedAt: string
  finishedAt?: string
}

export type ScanResponse = {
  current?: ScanJob
  recent: ScanJob[]
}

export type StartScanRequest = {
  path: string
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
const useMocks = import.meta.env.VITE_USE_MOCKS === 'true'

const mockTracks: Track[] = [
  {
    id: 1,
    title: '雨后街灯',
    artist: '林野',
    album: '城市慢拍',
    durationMs: 247000,
    format: 'flac',
  },
  {
    id: 2,
    title: 'Nocturne in C Minor',
    artist: 'Mira Vale',
    album: 'Quiet Hours',
    durationMs: 312000,
    format: 'mp3',
  },
  {
    id: 3,
    title: '海盐汽水',
    artist: '夏末合唱团',
    album: '日光练习',
    durationMs: 221000,
    format: 'm4a',
  },
  {
    id: 4,
    title: 'Northern Window',
    artist: 'Hollow Pines',
    album: 'Small Rooms',
    durationMs: 286000,
    format: 'ogg',
  },
  {
    id: 5,
    title: '旧磁带 A 面',
    artist: '陈知远',
    album: '夜航录音',
    durationMs: 198000,
    format: 'wav',
  },
  {
    id: 6,
    title: 'Mint Morning',
    artist: 'Ada Stone',
    album: 'Light Table',
    durationMs: 264000,
    format: 'aac',
  },
]

const mockScans: ScanJob[] = [
  {
    id: 103,
    path: '/home/ghp/Music',
    status: 'running',
    totalFiles: 342,
    scannedFiles: 128,
    startedAt: '今天 14:18',
  },
  {
    id: 102,
    path: '/mnt/d/Audio',
    status: 'completed',
    totalFiles: 96,
    scannedFiles: 96,
    startedAt: '昨天 21:04',
    finishedAt: '昨天 21:05',
  },
  {
    id: 101,
    path: '/home/ghp/Downloads',
    status: 'failed',
    totalFiles: 18,
    scannedFiles: 7,
    errorMessage: '目录中有文件无法读取',
    startedAt: '周六 10:32',
    finishedAt: '周六 10:32',
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
    throw new Error(`Request failed: ${response.status}`)
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
    rootCount: 3,
    trackCount: mockTracks.length,
    latestScanStatus: 'running',
  })
}

export async function getTracks(query: string): Promise<Track[]> {
  return withMockFallback(() => request<Track[]>(`/api/tracks?q=${encodeURIComponent(query)}`), filterTracks(query))
}

export async function getScans(): Promise<ScanResponse> {
  return withMockFallback(() => request<ScanResponse>('/api/scans'), {
    current: mockScans.find((scan) => scan.status === 'running'),
    recent: mockScans,
  })
}

export async function startScan(payload: StartScanRequest): Promise<ScanJob> {
  return withMockFallback(
    () =>
      request<ScanJob>('/api/scan', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    {
      id: Date.now(),
      path: payload.path,
      status: 'waiting',
      totalFiles: 0,
      scannedFiles: 0,
      startedAt: '刚刚',
    },
  )
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
    [track.title, track.artist, track.album, track.format].some((value) => value.toLowerCase().includes(normalized)),
  )
}
