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

type Store interface {
	UpsertLibraryRoot(ctx context.Context, path string) (storage.LibraryRoot, error)
	CreateScanJob(ctx context.Context, rootID int64, path string) (storage.ScanJob, error)
	MarkScanJobRunning(ctx context.Context, jobID int64, totalFiles int64) error
	UpdateScanJobProgress(ctx context.Context, jobID int64, scannedFiles int64) error
	CountTracksByRoot(ctx context.Context, rootID int64) (int64, error)
	CountUnknownDurationTracksByRoot(ctx context.Context, rootID int64) (int64, error)
	ReplaceTracksForRoot(ctx context.Context, rootID int64, tracks []storage.TrackInput) error
	MarkScanJobCompleted(ctx context.Context, jobID int64) error
	MarkScanJobCompletedWithMessage(ctx context.Context, jobID int64, totalFiles int64, message string) error
	MarkScanJobFailed(ctx context.Context, jobID int64, message string) error
	TouchLibraryRootScannedAt(ctx context.Context, id int64) error
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

func (s *Service) Start(ctx context.Context, path string) (storage.ScanJob, error) {
	cleanPath, err := validateDirectory(path)
	if err != nil {
		return storage.ScanJob{}, err
	}

	root, err := s.store.UpsertLibraryRoot(ctx, cleanPath)
	if err != nil {
		return storage.ScanJob{}, fmt.Errorf("save library root: %w", err)
	}

	job, err := s.store.CreateScanJob(ctx, root.ID, cleanPath)
	if err != nil {
		return storage.ScanJob{}, fmt.Errorf("create scan job: %w", err)
	}

	go s.run(context.Background(), root, job)

	return job, nil
}

func (s *Service) run(ctx context.Context, root storage.LibraryRoot, job storage.ScanJob) {
	files, newestModTime, err := collectAudioFiles(root.Path)
	if err != nil {
		s.fail(ctx, job.ID, err)
		return
	}

	unchanged, err := s.isUnchanged(ctx, root, int64(len(files)), newestModTime)
	if err != nil {
		s.fail(ctx, job.ID, err)
		return
	}
	if unchanged {
		if err := s.store.MarkScanJobCompletedWithMessage(ctx, job.ID, int64(len(files)), "源数据目录没有变动"); err != nil {
			s.fail(ctx, job.ID, err)
		}
		return
	}

	if err := s.store.MarkScanJobRunning(ctx, job.ID, int64(len(files))); err != nil {
		s.fail(ctx, job.ID, err)
		return
	}

	tracks := make([]storage.TrackInput, 0, len(files))
	for i, file := range files {
		track, err := buildTrack(root.ID, file)
		if err != nil {
			s.log.Warn("skip unreadable audio file", "path", file, "error", err)
		} else {
			tracks = append(tracks, track)
		}

		if err := s.store.UpdateScanJobProgress(ctx, job.ID, int64(i+1)); err != nil {
			s.fail(ctx, job.ID, err)
			return
		}
	}

	if err := s.store.ReplaceTracksForRoot(ctx, root.ID, tracks); err != nil {
		s.fail(ctx, job.ID, fmt.Errorf("replace tracks: %w", err))
		return
	}
	if err := s.store.TouchLibraryRootScannedAt(ctx, root.ID); err != nil {
		s.fail(ctx, job.ID, err)
		return
	}
	if err := s.store.MarkScanJobCompleted(ctx, job.ID); err != nil {
		s.log.Error("mark scan completed", "job_id", job.ID, "error", err)
	}
}

func (s *Service) fail(ctx context.Context, jobID int64, err error) {
	s.log.Error("scan failed", "job_id", jobID, "error", err)
	if markErr := s.store.MarkScanJobFailed(ctx, jobID, err.Error()); markErr != nil {
		s.log.Error("mark scan failed", "job_id", jobID, "error", markErr)
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

func (s *Service) isUnchanged(ctx context.Context, root storage.LibraryRoot, fileCount int64, newestModTime time.Time) (bool, error) {
	if root.LastScannedAt == "" {
		return false, nil
	}

	lastScannedAt, err := time.Parse(time.RFC3339Nano, root.LastScannedAt)
	if err != nil {
		return false, nil
	}

	trackCount, err := s.store.CountTracksByRoot(ctx, root.ID)
	if err != nil {
		return false, err
	}
	if trackCount != fileCount {
		return false, nil
	}
	unknownDurations, err := s.store.CountUnknownDurationTracksByRoot(ctx, root.ID)
	if err != nil {
		return false, err
	}
	if unknownDurations > 0 {
		return false, nil
	}
	if newestModTime.IsZero() {
		return true, nil
	}
	return !newestModTime.After(lastScannedAt), nil
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

func buildTrack(rootID int64, path string) (storage.TrackInput, error) {
	info, err := os.Stat(path)
	if err != nil {
		return storage.TrackInput{}, err
	}

	meta, err := metadata.Read(path)
	if err != nil {
		slog.Debug("metadata fallback", "path", path, "error", err)
	}

	title := strings.TrimSpace(meta.Title)
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	}

	return storage.TrackInput{
		RootID:     rootID,
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
