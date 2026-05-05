package scanner

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"ayan/internal/metadata"
	"ayan/internal/storage"
)

const unchangedMessage = "媒体库已是最新，无需重新导入"

type Store interface {
	GetLibrary(ctx context.Context, id int64) (storage.Library, error)
	StartScanTask(ctx context.Context, libraryID int64) (storage.ScanTask, error)
	MarkScanTaskRunning(ctx context.Context, libraryID int64, totalFiles int64) error
	UpdateScanTaskProgress(ctx context.Context, libraryID int64, scannedFiles int64) error
	CountMusicByLibrary(ctx context.Context, libraryID int64) (int64, error)
	CountUnknownDurationMusicByLibrary(ctx context.Context, libraryID int64) (int64, error)
	ReplaceMusicForLibrary(ctx context.Context, libraryID int64, tracks []storage.MusicInput) error
	MarkScanTaskCompleted(ctx context.Context, libraryID int64, totalFiles int64, message string) error
	MarkScanTaskFailed(ctx context.Context, libraryID int64, message string) error
}

type Service struct {
	store Store
	log   *slog.Logger
}

func New(store Store, log *slog.Logger) *Service {
	if log == nil {
		log = slog.Default()
	}
	return &Service{store: store, log: log}
}

func (s *Service) Start(ctx context.Context, libraryID int64) (storage.ScanTask, error) {
	library, err := s.store.GetLibrary(ctx, libraryID)
	if err != nil {
		return storage.ScanTask{}, err
	}
	if _, err := validateDirectory(library.Path); err != nil {
		return storage.ScanTask{}, err
	}

	task, err := s.store.StartScanTask(ctx, library.ID)
	if err != nil {
		return storage.ScanTask{}, err
	}

	go s.run(context.Background(), library)

	return task, nil
}

func (s *Service) run(ctx context.Context, library storage.Library) {
	files, newestModTime, err := collectAudioFiles(library.Path)
	if err != nil {
		s.fail(ctx, library.ID, err)
		return
	}

	unchanged, err := s.isUnchanged(ctx, library, int64(len(files)), newestModTime)
	if err != nil {
		s.fail(ctx, library.ID, err)
		return
	}
	if unchanged {
		if err := s.store.MarkScanTaskCompleted(ctx, library.ID, int64(len(files)), unchangedMessage); err != nil {
			s.fail(ctx, library.ID, err)
		}
		return
	}

	if err := s.store.MarkScanTaskRunning(ctx, library.ID, int64(len(files))); err != nil {
		s.fail(ctx, library.ID, err)
		return
	}

	tracks := make([]storage.MusicInput, 0, len(files))
	for i, file := range files {
		track, err := buildTrack(file)
		if err != nil {
			s.log.Warn("skip unreadable audio file", "path", file, "error", err)
		} else {
			tracks = append(tracks, track)
		}

		if err := s.store.UpdateScanTaskProgress(ctx, library.ID, int64(i+1)); err != nil {
			s.fail(ctx, library.ID, err)
			return
		}
	}

	if err := s.store.ReplaceMusicForLibrary(ctx, library.ID, tracks); err != nil {
		s.fail(ctx, library.ID, fmt.Errorf("replace music: %w", err))
		return
	}
	if err := s.store.MarkScanTaskCompleted(ctx, library.ID, int64(len(files)), "扫描完成"); err != nil {
		s.log.Error("mark scan completed", "library_id", library.ID, "error", err)
	}
}

func (s *Service) fail(ctx context.Context, libraryID int64, err error) {
	s.log.Error("scan failed", "library_id", libraryID, "error", err)
	if markErr := s.store.MarkScanTaskFailed(ctx, libraryID, err.Error()); markErr != nil {
		s.log.Error("mark scan failed", "library_id", libraryID, "error", markErr)
	}
}

func validateDirectory(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", fmt.Errorf("path is required")
	}

	cleanPath, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolve path: %w", err)
	}

	info, err := os.Stat(cleanPath)
	if err != nil {
		return "", fmt.Errorf("stat directory: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("path is not a directory")
	}

	entries, err := os.ReadDir(cleanPath)
	if err != nil {
		return "", fmt.Errorf("read directory: %w", err)
	}
	_ = entries

	return cleanPath, nil
}

func (s *Service) isUnchanged(ctx context.Context, library storage.Library, fileCount int64, newestModTime time.Time) (bool, error) {
	if library.Scan.CompletedAt == "" || library.Scan.Status != "completed" {
		return false, nil
	}

	completedAt, err := time.Parse(time.RFC3339Nano, library.Scan.CompletedAt)
	if err != nil {
		return false, nil
	}

	trackCount, err := s.store.CountMusicByLibrary(ctx, library.ID)
	if err != nil {
		return false, err
	}
	if trackCount != fileCount {
		return false, nil
	}
	unknownDurations, err := s.store.CountUnknownDurationMusicByLibrary(ctx, library.ID)
	if err != nil {
		return false, err
	}
	if unknownDurations > 0 {
		return false, nil
	}
	if newestModTime.IsZero() {
		return true, nil
	}
	return !newestModTime.After(completedAt), nil
}

func collectAudioFiles(root string) ([]string, time.Time, error) {
	var files []string
	var newestModTime time.Time
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}

		if path != root && isHidden(entry.Name()) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		if entry.IsDir() {
			return nil
		}

		if _, ok := SupportedExtensions[strings.ToLower(filepath.Ext(entry.Name()))]; ok {
			files = append(files, path)
			if info, err := entry.Info(); err == nil && info.ModTime().After(newestModTime) {
				newestModTime = info.ModTime()
			}
		}
		return nil
	})
	return files, newestModTime, err
}

func buildTrack(path string) (storage.MusicInput, error) {
	info, err := os.Stat(path)
	if err != nil {
		return storage.MusicInput{}, err
	}

	meta, err := metadata.Read(path)
	if err != nil {
		slog.Debug("metadata fallback", "path", path, "error", err)
	}

	title := strings.TrimSpace(meta.Title)
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	}

	return storage.MusicInput{
		Path:       path,
		Title:      title,
		Artist:     strings.TrimSpace(meta.Artist),
		Album:      strings.TrimSpace(meta.Album),
		DurationMS: meta.DurationMS,
		Format:     strings.TrimPrefix(strings.ToLower(filepath.Ext(path)), "."),
		SizeBytes:  info.Size(),
		MTimeUnix:  info.ModTime().Unix(),
	}, nil
}

func isHidden(name string) bool {
	return strings.HasPrefix(name, ".")
}
