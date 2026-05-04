package storage

type LibraryRoot struct {
	ID            int64
	Path          string
	CreatedAt     string
	LastScannedAt string
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
	CreatedAt  string
	UpdatedAt  string
}

type ScanJob struct {
	ID           int64
	RootID       int64
	Path         string
	Status       string
	TotalFiles   int64
	ScannedFiles int64
	ErrorMessage string
	StartedAt    string
	FinishedAt   string
}

type TrackInput struct {
	RootID     int64
	Path       string
	Title      string
	Artist     string
	Album      string
	DurationMS int64
	Format     string
	SizeBytes  int64
	MTimeUnix  int64
}

type LibrarySummary struct {
	RootCount        int64
	TrackCount       int64
	LatestScanStatus string
}
