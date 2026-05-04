-- Library roots

-- name: GetLibraryRootByPath
SELECT id, path, created_at, last_scanned_at
FROM library_roots
WHERE path = ?;

-- name: InsertLibraryRoot
INSERT INTO library_roots (path)
VALUES (?)
ON CONFLICT(path) DO UPDATE SET path = excluded.path
RETURNING id, path, created_at, last_scanned_at;

-- name: TouchLibraryRootScannedAt
UPDATE library_roots
SET last_scanned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ?;

-- name: CountLibraryRoots
SELECT COUNT(*) FROM library_roots;

-- Tracks

-- name: DeleteTracksByRoot
DELETE FROM tracks
WHERE root_id = ?;

-- name: InsertTrack
INSERT INTO tracks (
  root_id,
  path,
  title,
  artist,
  album,
  duration_ms,
  format,
  size_bytes,
  mtime_unix
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(root_id, path) DO UPDATE SET
  title = excluded.title,
  artist = excluded.artist,
  album = excluded.album,
  duration_ms = excluded.duration_ms,
  format = excluded.format,
  size_bytes = excluded.size_bytes,
  mtime_unix = excluded.mtime_unix,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- name: ListTracks
SELECT id, root_id, path, title, artist, album, duration_ms, format, size_bytes, mtime_unix, created_at, updated_at
FROM tracks
WHERE
  ? = ''
  OR title LIKE '%' || ? || '%'
  OR artist LIKE '%' || ? || '%'
  OR album LIKE '%' || ? || '%'
ORDER BY title COLLATE NOCASE ASC, artist COLLATE NOCASE ASC, album COLLATE NOCASE ASC;

-- name: GetTrackPath
SELECT path
FROM tracks
WHERE id = ?;

-- name: CountTracks
SELECT COUNT(*) FROM tracks;

-- Scan jobs

-- name: CreateScanJob
INSERT INTO scan_jobs (root_id, path, status)
VALUES (?, ?, 'waiting')
RETURNING id, root_id, path, status, total_files, scanned_files, error_message, started_at, finished_at;

-- name: MarkScanJobRunning
UPDATE scan_jobs
SET status = 'running',
    total_files = ?,
    scanned_files = 0,
    message = '',
    error_message = ''
WHERE id = ?;

-- name: UpdateScanJobProgress
UPDATE scan_jobs
SET scanned_files = ?
WHERE id = ?;

-- name: MarkScanJobCompleted
UPDATE scan_jobs
SET status = 'completed',
    scanned_files = total_files,
    finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ?;

-- name: MarkScanJobFailed
UPDATE scan_jobs
SET status = 'failed',
    error_message = ?,
    finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ?;

-- name: ListRecentScanJobs
SELECT id, root_id, path, status, total_files, scanned_files, message, error_message, started_at, finished_at
FROM scan_jobs
ORDER BY started_at DESC
LIMIT ?;

-- name: DeleteScanJobTracks
DELETE FROM tracks
WHERE root_id = ?;

-- name: DeleteScanJobRoot
DELETE FROM library_roots
WHERE id = ?;

-- name: DeleteScanJob
DELETE FROM scan_jobs
WHERE id = ?;

-- Library summary

-- name: GetLibrarySummary
SELECT
  (SELECT COUNT(*) FROM library_roots) AS root_count,
  (SELECT COUNT(*) FROM tracks) AS track_count,
  (SELECT status FROM scan_jobs ORDER BY started_at DESC LIMIT 1) AS latest_scan_status;
