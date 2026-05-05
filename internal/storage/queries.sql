-- Libraries

-- name: CreateLibrary
INSERT INTO libraries (path, updated_at)
VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(path) DO UPDATE SET
  path = excluded.path,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
RETURNING id;

-- name: EnsureScanTask
INSERT INTO scan_tasks (library_id, status)
VALUES (?, 'idle')
ON CONFLICT(library_id) DO NOTHING;

-- name: ListLibraries
SELECT
  l.id,
  l.path,
  (SELECT COUNT(*) FROM library_music lm WHERE lm.library_id = l.id) AS music_count,
  l.created_at,
  l.updated_at,
  st.id,
  l.id AS library_id,
  st.status,
  st.total_files,
  st.scanned_files,
  st.message,
  st.completed_at
FROM libraries l
LEFT JOIN scan_tasks st ON st.library_id = l.id
ORDER BY l.created_at DESC;

-- Scan tasks

-- name: StartScanTask
UPDATE scan_tasks
SET status = 'waiting',
    total_files = 0,
    scanned_files = 0,
    message = '',
    completed_at = NULL
WHERE library_id = ?
RETURNING id, library_id, status, total_files, scanned_files, message, completed_at;

-- name: MarkScanTaskRunning
UPDATE scan_tasks
SET status = 'running',
    total_files = ?,
    scanned_files = 0,
    message = '',
    completed_at = NULL
WHERE library_id = ?;

-- name: UpdateScanTaskProgress
UPDATE scan_tasks
SET scanned_files = ?
WHERE library_id = ?;

-- name: MarkScanTaskCompleted
UPDATE scan_tasks
SET status = 'completed',
    total_files = ?,
    scanned_files = ?,
    message = ?,
    completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE library_id = ?;

-- name: MarkScanTaskFailed
UPDATE scan_tasks
SET status = 'failed',
    message = ?,
    completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE library_id = ?;

-- name: ListActiveScanTasks
SELECT id, library_id, status, total_files, scanned_files, message, completed_at
FROM scan_tasks
WHERE status IN ('waiting', 'running')
ORDER BY id ASC;

-- Music

-- name: UpsertMusic
INSERT INTO music (
  path, title, artist, album, duration_ms, format, size_bytes, mtime_unix, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(path) DO UPDATE SET
  title = excluded.title,
  artist = excluded.artist,
  album = excluded.album,
  duration_ms = excluded.duration_ms,
  format = excluded.format,
  size_bytes = excluded.size_bytes,
  mtime_unix = excluded.mtime_unix,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
RETURNING id;

-- name: LinkLibraryMusic
INSERT INTO library_music (library_id, music_id)
VALUES (?, ?)
ON CONFLICT(library_id, music_id) DO NOTHING;

-- name: ListTracks
SELECT id, path, title, artist, album, duration_ms, format, size_bytes, mtime_unix, created_at, updated_at
FROM music
WHERE
  ? = ''
  OR title LIKE '%' || ? || '%'
  OR artist LIKE '%' || ? || '%'
  OR album LIKE '%' || ? || '%'
ORDER BY title COLLATE NOCASE ASC, artist COLLATE NOCASE ASC, album COLLATE NOCASE ASC;

-- name: DeleteOrphanMusic
DELETE FROM music
WHERE id = ?
  AND NOT EXISTS (
    SELECT 1
    FROM library_music
    WHERE library_music.music_id = music.id
  );

-- Library summary

-- name: GetLibrarySummary
SELECT
  (SELECT COUNT(*) FROM libraries) AS root_count,
  (SELECT COUNT(*) FROM music) AS track_count,
  (SELECT status FROM scan_tasks ORDER BY COALESCE(completed_at, '') DESC, id DESC LIMIT 1) AS latest_scan_status;
