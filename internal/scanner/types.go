package scanner

var SupportedExtensions = map[string]struct{}{
	".aac":  {},
	".flac": {},
	".m4a":  {},
	".mp3":  {},
	".ogg":  {},
	".wav":  {},
}

type ScanRequest struct {
	Path string
}

type ScanProgress struct {
	JobID        int64
	Path         string
	Status       string
	TotalFiles   int64
	ScannedFiles int64
	ErrorMessage string
}

