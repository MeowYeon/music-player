export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

export function playbackLabel(status: PlaybackStatus) {
  switch (status) {
    case 'loading':
      return '加载中'
    case 'playing':
      return '播放中'
    case 'paused':
      return '已暂停'
    case 'ended':
      return '播放结束'
    case 'error':
      return '播放失败'
    case 'idle':
      return '待播放'
  }
}

export function playModeLabel(mode: 'sequence' | 'loop' | 'shuffle' | 'single') {
  switch (mode) {
    case 'sequence':
      return '顺序播放'
    case 'loop':
      return '列表循环'
    case 'shuffle':
      return '随机播放'
    case 'single':
      return '单曲循环'
  }
}

export function formatDuration(durationMs: number) {
  if (!durationMs) {
    return '未知'
  }
  const totalSeconds = Math.floor(durationMs / 1000)
  return formatDurationSeconds(totalSeconds)
}

export function formatDurationSeconds(secondsValue: number) {
  if (!secondsValue || !Number.isFinite(secondsValue)) {
    return '0:00'
  }
  const totalSeconds = Math.floor(secondsValue)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
