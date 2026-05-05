package storage

type Library struct {
	ID         int64
	Path       string
	MusicCount int64
	CreatedAt  string
	UpdatedAt  string
	Scan       ScanTask
}

type ScanTask struct {
	ID           int64
	LibraryID    int64
	Status       string
	TotalFiles   int64
	ScannedFiles int64
	Message      string
	CompletedAt  string
}

type Track struct {
	ID         int64
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
	Liked      bool
}

type MusicInput struct {
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

type Playlist struct {
	ID         int64
	Name       string
	Type       string
	TrackCount int64
	CreatedAt  string
	UpdatedAt  string
}
