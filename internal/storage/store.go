package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

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
	db.SetMaxOpenConns(1)

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
	return s.ensureSystemPlaylists(ctx)
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

func (s *Store) CreateLibrary(ctx context.Context, path string) (Library, error) {
	row := s.db.QueryRowContext(ctx, `
		INSERT INTO libraries (path, updated_at)
		VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
		ON CONFLICT(path) DO UPDATE SET
			path = excluded.path,
			updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		RETURNING id
	`, path)
	var id int64
	if err := row.Scan(&id); err != nil {
		return Library{}, err
	}
	if err := s.ensureScanTask(ctx, id); err != nil {
		return Library{}, err
	}
	return s.GetLibrary(ctx, id)
}

func (s *Store) ensureScanTask(ctx context.Context, libraryID int64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO scan_tasks (library_id, status)
		VALUES (?, 'idle')
		ON CONFLICT(library_id) DO NOTHING
	`, libraryID)
	return err
}

func (s *Store) GetLibrary(ctx context.Context, id int64) (Library, error) {
	row := s.db.QueryRowContext(ctx, librarySelectSQL()+` WHERE l.id = ?`, id)
	library, err := scanLibrary(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Library{}, ErrNotFound
	}
	return library, err
}

func (s *Store) ListLibraries(ctx context.Context) ([]Library, error) {
	rows, err := s.db.QueryContext(ctx, librarySelectSQL()+` ORDER BY l.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var libraries []Library
	for rows.Next() {
		library, err := scanLibrary(rows)
		if err != nil {
			return nil, err
		}
		libraries = append(libraries, library)
	}
	return libraries, rows.Err()
}

func librarySelectSQL() string {
	return `
		SELECT
			l.id,
			l.path,
			(SELECT COUNT(*) FROM library_music lm WHERE lm.library_id = l.id),
			l.created_at,
			l.updated_at,
			COALESCE(st.id, 0),
			l.id,
			COALESCE(st.status, 'idle'),
			COALESCE(st.total_files, 0),
			COALESCE(st.scanned_files, 0),
			COALESCE(st.message, ''),
			COALESCE(st.completed_at, '')
		FROM libraries l
		LEFT JOIN scan_tasks st ON st.library_id = l.id
	`
}

func (s *Store) DeleteLibrary(ctx context.Context, id int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	musicIDs, err := listMusicIDsByLibrary(ctx, tx, id)
	if err != nil {
		return err
	}

	if _, err = tx.ExecContext(ctx, `DELETE FROM library_music WHERE library_id = ?`, id); err != nil {
		return err
	}
	if err = deleteOrphanMusic(ctx, tx, musicIDs); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM scan_tasks WHERE library_id = ?`, id); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM libraries WHERE id = ?`, id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}

	return tx.Commit()
}

func (s *Store) ensureSystemPlaylists(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO playlists (name, type)
		VALUES ('我喜欢', 'liked')
		ON CONFLICT(type) WHERE type = 'liked' DO UPDATE SET
			name = '我喜欢',
			updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
	`); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO playlists (name, type)
		VALUES ('最近播放', 'recent')
		ON CONFLICT(type) WHERE type = 'recent' DO UPDATE SET
			name = '最近播放',
			updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
	`)
	return err
}

func (s *Store) ListPlaylists(ctx context.Context) ([]Playlist, error) {
	rows, err := s.db.QueryContext(ctx, playlistSelectSQL()+` WHERE p.type = 'normal' ORDER BY p.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var playlists []Playlist
	for rows.Next() {
		playlist, err := scanPlaylist(rows)
		if err != nil {
			return nil, err
		}
		playlists = append(playlists, playlist)
	}
	return playlists, rows.Err()
}

func (s *Store) CreatePlaylist(ctx context.Context, name string) (Playlist, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Playlist{}, fmt.Errorf("playlist name is required")
	}
	row := s.db.QueryRowContext(ctx, `
		INSERT INTO playlists (name, type)
		VALUES (?, 'normal')
		RETURNING id
	`, name)
	var id int64
	if err := row.Scan(&id); err != nil {
		return Playlist{}, err
	}
	return s.GetPlaylist(ctx, id)
}

func (s *Store) GetPlaylist(ctx context.Context, id int64) (Playlist, error) {
	row := s.db.QueryRowContext(ctx, playlistSelectSQL()+` WHERE p.id = ?`, id)
	playlist, err := scanPlaylist(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Playlist{}, ErrNotFound
	}
	return playlist, err
}

func (s *Store) RenamePlaylist(ctx context.Context, id int64, name string) (Playlist, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Playlist{}, fmt.Errorf("playlist name is required")
	}
	result, err := s.db.ExecContext(ctx, `
		UPDATE playlists
		SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		WHERE id = ? AND type = 'normal'
	`, name, id)
	if err != nil {
		return Playlist{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return Playlist{}, err
	}
	if affected == 0 {
		return Playlist{}, ErrInvalidOperation
	}
	return s.GetPlaylist(ctx, id)
}

func (s *Store) DeletePlaylist(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM playlists WHERE id = ? AND type = 'normal'`, id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrInvalidOperation
	}
	return nil
}

func playlistSelectSQL() string {
	return `
		SELECT
			p.id,
			p.name,
			p.type,
			(SELECT COUNT(*) FROM playlist_music pm WHERE pm.playlist_id = p.id),
			p.created_at,
			p.updated_at
		FROM playlists p
	`
}

func (s *Store) AddTrackToPlaylist(ctx context.Context, playlistID int64, trackID int64) error {
	if err := s.ensureNormalPlaylistAndMusic(ctx, playlistID, trackID); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO playlist_music (playlist_id, music_id)
		VALUES (?, ?)
		ON CONFLICT(playlist_id, music_id) DO NOTHING
	`, playlistID, trackID)
	return err
}

func (s *Store) RemoveTrackFromPlaylist(ctx context.Context, playlistID int64, trackID int64) error {
	if err := s.ensureNormalPlaylistAndMusic(ctx, playlistID, trackID); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM playlist_music WHERE playlist_id = ? AND music_id = ?`, playlistID, trackID)
	return err
}

func (s *Store) ListPlaylistTracks(ctx context.Context, playlistID int64) ([]Track, error) {
	var playlistType string
	if err := s.db.QueryRowContext(ctx, `SELECT type FROM playlists WHERE id = ?`, playlistID).Scan(&playlistType); errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, err
	}

	orderBy := `pm.added_at ASC`
	if playlistType == "recent" {
		orderBy = `COALESCE(pm.last_played_at, pm.added_at) DESC`
	}

	limit := ``
	if playlistType == "recent" {
		limit = ` LIMIT 50`
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT `+trackSelectColumns()+`
		FROM music m
		JOIN playlist_music pm ON pm.music_id = m.id
		WHERE pm.playlist_id = ?
		ORDER BY `+orderBy+limit, playlistID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTracks(rows)
}

func (s *Store) ListSystemPlaylistTracks(ctx context.Context, playlistType string) ([]Track, error) {
	id, err := s.systemPlaylistID(ctx, playlistType)
	if err != nil {
		return nil, err
	}
	return s.ListPlaylistTracks(ctx, id)
}

func (s *Store) LikeTrack(ctx context.Context, trackID int64) error {
	if err := s.ensureMusic(ctx, trackID); err != nil {
		return err
	}
	id, err := s.systemPlaylistID(ctx, "liked")
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO playlist_music (playlist_id, music_id)
		VALUES (?, ?)
		ON CONFLICT(playlist_id, music_id) DO NOTHING
	`, id, trackID)
	return err
}

func (s *Store) UnlikeTrack(ctx context.Context, trackID int64) error {
	id, err := s.systemPlaylistID(ctx, "liked")
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM playlist_music WHERE playlist_id = ? AND music_id = ?`, id, trackID)
	return err
}

func (s *Store) RecordRecentPlay(ctx context.Context, trackID int64) error {
	if err := s.ensureMusic(ctx, trackID); err != nil {
		return err
	}
	id, err := s.systemPlaylistID(ctx, "recent")
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO playlist_music (playlist_id, music_id, last_played_at)
		VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
		ON CONFLICT(playlist_id, music_id) DO UPDATE SET
			last_played_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
	`, id, trackID)
	return err
}

func (s *Store) systemPlaylistID(ctx context.Context, playlistType string) (int64, error) {
	var id int64
	err := s.db.QueryRowContext(ctx, `SELECT id FROM playlists WHERE type = ?`, playlistType).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		if err := s.ensureSystemPlaylists(ctx); err != nil {
			return 0, err
		}
		err = s.db.QueryRowContext(ctx, `SELECT id FROM playlists WHERE type = ?`, playlistType).Scan(&id)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNotFound
	}
	return id, err
}

func (s *Store) ensureNormalPlaylistAndMusic(ctx context.Context, playlistID int64, trackID int64) error {
	var playlistType string
	if err := s.db.QueryRowContext(ctx, `SELECT type FROM playlists WHERE id = ?`, playlistID).Scan(&playlistType); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if playlistType != "normal" {
		return ErrInvalidOperation
	}
	return s.ensureMusic(ctx, trackID)
}

func (s *Store) ensureMusic(ctx context.Context, trackID int64) error {
	var exists int
	if err := s.db.QueryRowContext(ctx, `SELECT 1 FROM music WHERE id = ?`, trackID).Scan(&exists); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	return nil
}

func (s *Store) StartScanTask(ctx context.Context, libraryID int64) (ScanTask, error) {
	var status string
	if err := s.db.QueryRowContext(ctx, `SELECT status FROM scan_tasks WHERE library_id = ?`, libraryID).Scan(&status); errors.Is(err, sql.ErrNoRows) {
		if _, createErr := s.GetLibrary(ctx, libraryID); createErr != nil {
			return ScanTask{}, createErr
		}
		if createErr := s.ensureScanTask(ctx, libraryID); createErr != nil {
			return ScanTask{}, createErr
		}
	} else if err != nil {
		return ScanTask{}, err
	} else if status == "waiting" || status == "running" {
		return ScanTask{}, ErrInvalidOperation
	}

	row := s.db.QueryRowContext(ctx, `
		UPDATE scan_tasks
		SET status = 'waiting',
			total_files = 0,
			scanned_files = 0,
			message = '',
			completed_at = NULL
		WHERE library_id = ?
		RETURNING id, library_id, status, total_files, scanned_files, message, COALESCE(completed_at, '')
	`, libraryID)
	return scanScanTask(row)
}

func (s *Store) MarkScanTaskRunning(ctx context.Context, libraryID int64, totalFiles int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE scan_tasks
		SET status = 'running',
			total_files = ?,
			scanned_files = 0,
			message = '',
			completed_at = NULL
		WHERE library_id = ?
	`, totalFiles, libraryID)
	return err
}

func (s *Store) UpdateScanTaskProgress(ctx context.Context, libraryID int64, scannedFiles int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE scan_tasks
		SET scanned_files = ?
		WHERE library_id = ?
	`, scannedFiles, libraryID)
	return err
}

func (s *Store) MarkScanTaskCompleted(ctx context.Context, libraryID int64, totalFiles int64, message string) error {
	if strings.TrimSpace(message) == "" {
		message = "扫描完成"
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE scan_tasks
		SET status = 'completed',
			total_files = ?,
			scanned_files = ?,
			message = ?,
			completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		WHERE library_id = ?
	`, totalFiles, totalFiles, message, libraryID)
	return err
}

func (s *Store) MarkScanTaskFailed(ctx context.Context, libraryID int64, message string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE scan_tasks
		SET status = 'failed',
			message = ?,
			completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		WHERE library_id = ?
	`, message, libraryID)
	return err
}

func (s *Store) ListActiveScanTasks(ctx context.Context) ([]ScanTask, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, library_id, status, total_files, scanned_files, message, COALESCE(completed_at, '')
		FROM scan_tasks
		WHERE status IN ('waiting', 'running')
		ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []ScanTask
	for rows.Next() {
		task, err := scanScanTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

func (s *Store) CountMusicByLibrary(ctx context.Context, libraryID int64) (int64, error) {
	var count int64
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM library_music WHERE library_id = ?`, libraryID).Scan(&count)
	return count, err
}

func (s *Store) CountUnknownDurationMusicByLibrary(ctx context.Context, libraryID int64) (int64, error) {
	var count int64
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM music m
		JOIN library_music lm ON lm.music_id = m.id
		WHERE lm.library_id = ? AND m.duration_ms = 0
	`, libraryID).Scan(&count)
	return count, err
}

func (s *Store) ReplaceMusicForLibrary(ctx context.Context, libraryID int64, tracks []MusicInput) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	oldMusicIDs, err := listMusicIDsByLibrary(ctx, tx, libraryID)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM library_music WHERE library_id = ?`, libraryID); err != nil {
		return err
	}

	for _, track := range tracks {
		var musicID int64
		err = tx.QueryRowContext(ctx, `
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
			RETURNING id
		`, track.Path, track.Title, track.Artist, track.Album, track.DurationMS, track.Format, track.SizeBytes, track.MTimeUnix).Scan(&musicID)
		if err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO library_music (library_id, music_id)
			VALUES (?, ?)
			ON CONFLICT(library_id, music_id) DO NOTHING
		`, libraryID, musicID); err != nil {
			return err
		}
	}

	if err = deleteOrphanMusic(ctx, tx, oldMusicIDs); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		UPDATE libraries
		SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		WHERE id = ?
	`, libraryID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func listMusicIDsByLibrary(ctx context.Context, tx *sql.Tx, libraryID int64) ([]int64, error) {
	rows, err := tx.QueryContext(ctx, `SELECT music_id FROM library_music WHERE library_id = ?`, libraryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func deleteOrphanMusic(ctx context.Context, tx *sql.Tx, musicIDs []int64) error {
	for _, id := range musicIDs {
		if _, err := tx.ExecContext(ctx, `
			DELETE FROM music
			WHERE id = ?
			  AND NOT EXISTS (
				SELECT 1
				FROM library_music
				WHERE library_music.music_id = music.id
			  )
		`, id); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ListTracks(ctx context.Context, query string) ([]Track, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT `+trackSelectColumns()+`
		FROM music m
		WHERE
			? = ''
			OR m.title LIKE '%' || ? || '%'
			OR m.artist LIKE '%' || ? || '%'
			OR m.album LIKE '%' || ? || '%'
		ORDER BY m.title COLLATE NOCASE ASC, m.artist COLLATE NOCASE ASC, m.album COLLATE NOCASE ASC
	`, query, query, query, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanTracks(rows)
}

func trackSelectColumns() string {
	return `
		m.id,
		m.path,
		m.title,
		m.artist,
		m.album,
		m.duration_ms,
		m.format,
		m.size_bytes,
		m.mtime_unix,
		m.created_at,
		m.updated_at,
		EXISTS (
			SELECT 1
			FROM playlist_music liked_pm
			JOIN playlists liked_p ON liked_p.id = liked_pm.playlist_id
			WHERE liked_p.type = 'liked' AND liked_pm.music_id = m.id
		)
	`
}

func scanTracks(rows *sql.Rows) ([]Track, error) {
	var tracks []Track
	for rows.Next() {
		var track Track
		if err := rows.Scan(
			&track.ID,
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
			&track.Liked,
		); err != nil {
			return nil, err
		}
		tracks = append(tracks, track)
	}
	return tracks, rows.Err()
}

func (s *Store) GetTrackPath(ctx context.Context, id int64) (string, error) {
	var path string
	err := s.db.QueryRowContext(ctx, `SELECT path FROM music WHERE id = ?`, id).Scan(&path)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return path, err
}

func (s *Store) GetLibrarySummary(ctx context.Context) (LibrarySummary, error) {
	var summary LibrarySummary
	var latest sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM libraries),
			(SELECT COUNT(*) FROM music),
			(SELECT status FROM scan_tasks ORDER BY COALESCE(completed_at, '') DESC, id DESC LIMIT 1)
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

func scanLibrary(row scanner) (Library, error) {
	var library Library
	err := row.Scan(
		&library.ID,
		&library.Path,
		&library.MusicCount,
		&library.CreatedAt,
		&library.UpdatedAt,
		&library.Scan.ID,
		&library.Scan.LibraryID,
		&library.Scan.Status,
		&library.Scan.TotalFiles,
		&library.Scan.ScannedFiles,
		&library.Scan.Message,
		&library.Scan.CompletedAt,
	)
	return library, err
}

func scanScanTask(row scanner) (ScanTask, error) {
	var task ScanTask
	err := row.Scan(
		&task.ID,
		&task.LibraryID,
		&task.Status,
		&task.TotalFiles,
		&task.ScannedFiles,
		&task.Message,
		&task.CompletedAt,
	)
	return task, err
}

func scanPlaylist(row scanner) (Playlist, error) {
	var playlist Playlist
	err := row.Scan(
		&playlist.ID,
		&playlist.Name,
		&playlist.Type,
		&playlist.TrackCount,
		&playlist.CreatedAt,
		&playlist.UpdatedAt,
	)
	return playlist, err
}
