package scanner

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"ayan/internal/metadata"
	"ayan/internal/storage"
)

type Store interface {
	UpsertLibraryRoot(ctx context.Context, path string) (storage.LibraryRoot, error)
	CreateScanJob(ctx context.Context, rootID int64, path string) (storage.ScanJob, error)
	MarkScanJobRunning(ctx context.Context, jobID int64, totalFiles int64) error
	UpdateScanJobProgress(ctx context.Context, jobID int64, scannedFiles int64) error
	ReplaceTracksForRoot(ctx context.Context, rootID int64, tracks []storage.TrackInput) error
	MarkScanJobCompleted(ctx context.Context, jobID int64) error
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
	files, err := collectAudioFiles(root.Path)
	if err != nil {
		s.fail(ctx, job.ID, err)
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

func collectAudioFiles(root string) ([]string, error) {
	var files []string
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
		}
		return nil
	})
	return files, err
}

func buildTrack(rootID int64, path string) (storage.TrackInput, error) {
	info, err := os.Stat(path)
	if err != nil {
		return storage.TrackInput{}, err
	}

	meta, err := metadata.Read(path)
	if err != nil {
		meta = metadata.TrackMetadata{}
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
