package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

func Open(ctx context.Context, dbPath string) (*Store, error) {
	if err := ensureParentDir(dbPath); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	store := &Store{db: db}
	if err := store.init(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}

	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) init(ctx context.Context) error {
	schema, err := SchemaSQL()
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, schema); err != nil {
		return fmt.Errorf("init schema: %w", err)
	}
	if err := s.ensureScanJobColumns(ctx); err != nil {
		return err
	}
	return nil
}

func (s *Store) ensureScanJobColumns(ctx context.Context) error {
	hasMessage := false
	rows, err := s.db.QueryContext(ctx, `PRAGMA table_info(scan_jobs)`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name, columnType string
		var notNull int
		var defaultValue any
		var pk int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &pk); err != nil {
			return err
		}
		if name == "message" {
			hasMessage = true
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if !hasMessage {
		if _, err := s.db.ExecContext(ctx, `ALTER TABLE scan_jobs ADD COLUMN message TEXT NOT NULL DEFAULT ''`); err != nil {
			return err
		}
	}
	return nil
}

func ensureParentDir(dbPath string) error {
	dir := filepath.Dir(dbPath)
	if dir == "." || dir == "" {
		return nil
	}
	return mkdirAll(dir)
}

func mkdirAll(path string) error {
	return os.MkdirAll(path, 0o755)
}

func (s *Store) UpsertLibraryRoot(ctx context.Context, path string) (LibraryRoot, error) {
	row := s.db.QueryRowContext(ctx, `
		INSERT INTO library_roots (path)
		VALUES (?)
		ON CONFLICT(path) DO UPDATE SET path = excluded.path
		RETURNING id, path, created_at, COALESCE(last_scanned_at, '')
	`, path)
	return scanLibraryRoot(row)
}

func (s *Store) TouchLibraryRootScannedAt(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE library_roots
		SET last_scanned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		WHERE id = ?
	`, id)
	return err
}

func (s *Store) CreateScanJob(ctx context.Context, rootID int64, path string) (ScanJob, error) {
	row := s.db.QueryRowContext(ctx, `
		INSERT INTO scan_jobs (root_id, path, status)
		VALUES (?, ?, 'waiting')
		RETURNING id, COALESCE(root_id, 0), path, status, total_files, scanned_files, message, error_message, started_at, COALESCE(finished_at, '')
	`, rootID, path)
	return scanScanJob(row)
}

func (s *Store) MarkScanJobRunning(ctx context.Context, jobID int64, totalFiles int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE scan_jobs
		SET status = 'running',
		    total_files = ?,
		    scanned_files = 0,
		    message = '',
		    error_message = ''
		WHERE id = ?
	`, totalFiles, jobID)
	return err
}

func (s *Store) UpdateScanJobProgress(ctx context.Context, jobID int64, scannedFiles int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE scan_jobs
		SET scanned_files = ?
		WHERE id = ?
	`, scannedFiles, jobID)
	return err
}

func (s *Store) MarkScanJobCompleted(ctx context.Context, jobID int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE scan_jobs
		SET status = 'completed',
		    scanned_files = total_files,
		    finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		WHERE id = ?
	`, jobID)
	return err
}

func (s *Store) MarkScanJobCompletedWithMessage(ctx context.Context, jobID int64, totalFiles int64, message string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE scan_jobs
		SET status = 'completed',
		    total_files = ?,
		    scanned_files = ?,
		    message = ?,
		    finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		WHERE id = ?
	`, totalFiles, totalFiles, message, jobID)
	return err
}

func (s *Store) MarkScanJobFailed(ctx context.Context, jobID int64, message string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE scan_jobs
		SET status = 'failed',
		    error_message = ?,
		    finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		WHERE id = ?
	`, message, jobID)
	return err
}

func (s *Store) ReplaceTracksForRoot(ctx context.Context, rootID int64, tracks []TrackInput) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.ExecContext(ctx, `DELETE FROM tracks WHERE root_id = ?`, rootID); err != nil {
		return err
	}

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO tracks (
			root_id, path, title, artist, album, duration_ms, format, size_bytes, mtime_unix
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, track := range tracks {
		if _, err = stmt.ExecContext(
			ctx,
			track.RootID,
			track.Path,
			track.Title,
			track.Artist,
			track.Album,
			track.DurationMS,
			track.Format,
			track.SizeBytes,
			track.MTimeUnix,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) CountTracksByRoot(ctx context.Context, rootID int64) (int64, error) {
	var count int64
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tracks WHERE root_id = ?`, rootID).Scan(&count)
	return count, err
}

func (s *Store) CountUnknownDurationTracksByRoot(ctx context.Context, rootID int64) (int64, error) {
	var count int64
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tracks WHERE root_id = ? AND duration_ms = 0`, rootID).Scan(&count)
	return count, err
}

func (s *Store) ListTracks(ctx context.Context, query string) ([]Track, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, root_id, path, title, artist, album, duration_ms, format, size_bytes, mtime_unix, created_at, updated_at
		FROM tracks
		WHERE
			? = ''
			OR title LIKE '%' || ? || '%'
			OR artist LIKE '%' || ? || '%'
			OR album LIKE '%' || ? || '%'
		ORDER BY title COLLATE NOCASE ASC, artist COLLATE NOCASE ASC, album COLLATE NOCASE ASC
	`, query, query, query, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tracks []Track
	for rows.Next() {
		var track Track
		if err := rows.Scan(
			&track.ID,
			&track.RootID,
			&track.Path,
			&track.Title,
			&track.Artist,
			&track.Album,
			&track.DurationMS,
			&track.Format,
			&track.SizeBytes,
			&track.MTimeUnix,
			&track.CreatedAt,
			&track.UpdatedAt,
		); err != nil {
			return nil, err
		}
		tracks = append(tracks, track)
	}
	return tracks, rows.Err()
}

func (s *Store) GetTrackPath(ctx context.Context, id int64) (string, error) {
	var path string
	err := s.db.QueryRowContext(ctx, `SELECT path FROM tracks WHERE id = ?`, id).Scan(&path)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return path, err
}

func (s *Store) DeleteScanJob(ctx context.Context, jobID int64) error {
	var rootID int64
	var status string
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(root_id, 0), status
		FROM scan_jobs
		WHERE id = ?
	`, jobID).Scan(&rootID, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if status == "waiting" || status == "running" {
		return ErrInvalidOperation
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if rootID != 0 {
		if _, err = tx.ExecContext(ctx, `DELETE FROM tracks WHERE root_id = ?`, rootID); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `DELETE FROM library_roots WHERE id = ?`, rootID); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM scan_jobs WHERE id = ?`, jobID); err != nil {
		return err
	}

	return tx.Commit()
}

func (s *Store) ListRecentScanJobs(ctx context.Context, limit int64) ([]ScanJob, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, COALESCE(root_id, 0), path, status, total_files, scanned_files, message, error_message, started_at, COALESCE(finished_at, '')
		FROM scan_jobs
		ORDER BY started_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []ScanJob
	for rows.Next() {
		job, err := scanScanJob(rows)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

func (s *Store) CurrentScanJob(ctx context.Context) (*ScanJob, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, COALESCE(root_id, 0), path, status, total_files, scanned_files, message, error_message, started_at, COALESCE(finished_at, '')
		FROM scan_jobs
		WHERE status IN ('waiting', 'running')
		ORDER BY started_at DESC
		LIMIT 1
	`)
	job, err := scanScanJob(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (s *Store) GetLibrarySummary(ctx context.Context) (LibrarySummary, error) {
	var summary LibrarySummary
	var latest sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM library_roots),
			(SELECT COUNT(*) FROM tracks),
			(SELECT status FROM scan_jobs ORDER BY started_at DESC LIMIT 1)
	`).Scan(&summary.RootCount, &summary.TrackCount, &latest)
	if latest.Valid {
		summary.LatestScanStatus = latest.String
	}
	return summary, err
}

var ErrNotFound = errors.New("not found")
var ErrInvalidOperation = errors.New("invalid operation")

type scanner interface {
	Scan(dest ...any) error
}

func scanLibraryRoot(row scanner) (LibraryRoot, error) {
	var root LibraryRoot
	err := row.Scan(&root.ID, &root.Path, &root.CreatedAt, &root.LastScannedAt)
	return root, err
}

func scanScanJob(row scanner) (ScanJob, error) {
	var job ScanJob
	err := row.Scan(
		&job.ID,
		&job.RootID,
		&job.Path,
		&job.Status,
		&job.TotalFiles,
		&job.ScannedFiles,
		&job.Message,
		&job.ErrorMessage,
		&job.StartedAt,
		&job.FinishedAt,
	)
	return job, err
}
