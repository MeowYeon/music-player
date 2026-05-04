package storage

import "time"

type LibraryRoot struct {
	ID            int64
	Path          string
	CreatedAt     time.Time
	LastScannedAt time.Time
}

type Track struct {
	ID         int64
	RootID     int64
	Path       string
	Title      string
	Artist     string
	Album      string
	DurationMS int64
	Format     string
	SizeBytes  int64
	MTimeUnix  int64
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type ScanJob struct {
	ID           int64
	RootID       int64
	Path         string
	Status       string
	TotalFiles   int64
	ScannedFiles int64
	ErrorMessage string
	StartedAt    time.Time
	FinishedAt   time.Time
}

