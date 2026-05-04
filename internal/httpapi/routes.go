package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"

	"ayan/internal/storage"

	"github.com/go-chi/chi/v5"
)

type Server struct {
	storage Storage
	scanner Scanner
}

type Storage interface {
	GetLibrarySummary(ctx context.Context) (storage.LibrarySummary, error)
	CurrentScanJob(ctx context.Context) (*storage.ScanJob, error)
	ListRecentScanJobs(ctx context.Context, limit int64) ([]storage.ScanJob, error)
	ListTracks(ctx context.Context, query string) ([]storage.Track, error)
	GetTrackPath(ctx context.Context, id int64) (string, error)
	DeleteScanJob(ctx context.Context, jobID int64) error
}

type Scanner interface {
	Start(ctx context.Context, path string) (storage.ScanJob, error)
}

func New(storage Storage, scanner Scanner) *Server {
	return &Server{
		storage: storage,
		scanner: scanner,
	}
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/api/health", s.handleHealth)
	r.Get("/api/library", s.handleLibrary)
	r.Post("/api/scan", s.handleStartScan)
	r.Get("/api/scans", s.handleScans)
	r.Delete("/api/scans/{id}", s.handleDeleteScanJob)
	r.Get("/api/tracks", s.handleTracks)
	r.Get("/api/tracks/{id}/stream", s.handleTrackStream)
	return r
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleLibrary(w http.ResponseWriter, r *http.Request) {
	summary, err := s.storage.GetLibrarySummary(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, librarySummaryResponse{
		RootCount:        summary.RootCount,
		TrackCount:       summary.TrackCount,
		LatestScanStatus: summary.LatestScanStatus,
	})
}

func (s *Server) handleStartScan(w http.ResponseWriter, r *http.Request) {
	var request startScanRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	job, err := s.scanner.Start(r.Context(), request.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusAccepted, scanJobResponseFromStorage(job))
}

func (s *Server) handleScans(w http.ResponseWriter, r *http.Request) {
	current, err := s.storage.CurrentScanJob(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	recent, err := s.storage.ListRecentScanJobs(r.Context(), 12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	response := scansResponse{
		Recent: make([]scanJobResponse, 0, len(recent)),
	}
	if current != nil {
		currentResponse := scanJobResponseFromStorage(*current)
		response.Current = &currentResponse
	}
	for _, job := range recent {
		response.Recent = append(response.Recent, scanJobResponseFromStorage(job))
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleDeleteScanJob(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	if err := s.storage.DeleteScanJob(r.Context(), id); errors.Is(err, storage.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	} else if errors.Is(err, storage.ErrInvalidOperation) {
		writeError(w, http.StatusConflict, errors.New("cannot delete a waiting or running scan job"))
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleTracks(w http.ResponseWriter, r *http.Request) {
	tracks, err := s.storage.ListTracks(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	response := make([]trackResponse, 0, len(tracks))
	for _, track := range tracks {
		response = append(response, trackResponseFromStorage(track))
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleTrackStream(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	path, err := s.storage.GetTrackPath(r.Context(), id)
	if errors.Is(err, storage.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	file, err := os.Open(path)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, errorResponse{Error: err.Error()})
}

type errorResponse struct {
	Error string `json:"error"`
}

type startScanRequest struct {
	Path string `json:"path"`
}

type librarySummaryResponse struct {
	RootCount        int64  `json:"rootCount"`
	TrackCount       int64  `json:"trackCount"`
	LatestScanStatus string `json:"latestScanStatus"`
}

type scansResponse struct {
	Current *scanJobResponse  `json:"current,omitempty"`
	Recent  []scanJobResponse `json:"recent"`
}

type scanJobResponse struct {
	ID           int64  `json:"id"`
	Path         string `json:"path"`
	Status       string `json:"status"`
	TotalFiles   int64  `json:"totalFiles"`
	ScannedFiles int64  `json:"scannedFiles"`
	Message      string `json:"message,omitempty"`
	ErrorMessage string `json:"errorMessage,omitempty"`
	StartedAt    string `json:"startedAt"`
	FinishedAt   string `json:"finishedAt,omitempty"`
}

type trackResponse struct {
	ID         int64  `json:"id"`
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	Album      string `json:"album"`
	DurationMS int64  `json:"durationMs"`
	Format     string `json:"format"`
}

func scanJobResponseFromStorage(job storage.ScanJob) scanJobResponse {
	return scanJobResponse{
		ID:           job.ID,
		Path:         job.Path,
		Status:       job.Status,
		TotalFiles:   job.TotalFiles,
		ScannedFiles: job.ScannedFiles,
		Message:      job.Message,
		ErrorMessage: job.ErrorMessage,
		StartedAt:    job.StartedAt,
		FinishedAt:   job.FinishedAt,
	}
}

func trackResponseFromStorage(track storage.Track) trackResponse {
	return trackResponse{
		ID:         track.ID,
		Title:      track.Title,
		Artist:     track.Artist,
		Album:      track.Album,
		DurationMS: track.DurationMS,
		Format:     track.Format,
	}
}
