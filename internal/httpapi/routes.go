package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"ayan/internal/storage"

	"github.com/go-chi/chi/v5"
)

type Server struct {
	storage Storage
	scanner Scanner
}

type Storage interface {
	GetLibrarySummary(ctx context.Context) (storage.LibrarySummary, error)
	CreateLibrary(ctx context.Context, path string) (storage.Library, error)
	ListLibraries(ctx context.Context) ([]storage.Library, error)
	DeleteLibrary(ctx context.Context, id int64) error
	ListActiveScanTasks(ctx context.Context) ([]storage.ScanTask, error)
	ListTracks(ctx context.Context, query string) ([]storage.Track, error)
	GetTrackPath(ctx context.Context, id int64) (string, error)
	ListPlaylists(ctx context.Context) ([]storage.Playlist, error)
	CreatePlaylist(ctx context.Context, name string) (storage.Playlist, error)
	RenamePlaylist(ctx context.Context, id int64, name string) (storage.Playlist, error)
	DeletePlaylist(ctx context.Context, id int64) error
	ListPlaylistTracks(ctx context.Context, playlistID int64) ([]storage.Track, error)
	AddTrackToPlaylist(ctx context.Context, playlistID int64, trackID int64) error
	RemoveTrackFromPlaylist(ctx context.Context, playlistID int64, trackID int64) error
	ListSystemPlaylistTracks(ctx context.Context, playlistType string) ([]storage.Track, error)
	LikeTrack(ctx context.Context, trackID int64) error
	UnlikeTrack(ctx context.Context, trackID int64) error
	RecordRecentPlay(ctx context.Context, trackID int64) error
	ClearRecentPlays(ctx context.Context) error
}

type Scanner interface {
	Start(ctx context.Context, libraryID int64) (storage.ScanTask, error)
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
	r.Get("/api/libraries", s.handleLibraries)
	r.Post("/api/libraries", s.handleCreateLibrary)
	r.Delete("/api/libraries/{id}", s.handleDeleteLibrary)
	r.Post("/api/libraries/{id}/scan", s.handleStartLibraryScan)
	r.Get("/api/scan-tasks/active", s.handleActiveScanTasks)
	r.Get("/api/tracks", s.handleTracks)
	r.Get("/api/tracks/{id}/stream", s.handleTrackStream)
	r.Get("/api/playlists", s.handlePlaylists)
	r.Post("/api/playlists", s.handleCreatePlaylist)
	r.Patch("/api/playlists/{id}", s.handleRenamePlaylist)
	r.Delete("/api/playlists/{id}", s.handleDeletePlaylist)
	r.Get("/api/playlists/{id}/tracks", s.handlePlaylistTracks)
	r.Post("/api/playlists/{id}/tracks", s.handleAddPlaylistTrack)
	r.Delete("/api/playlists/{id}/tracks/{trackId}", s.handleRemovePlaylistTrack)
	r.Get("/api/playlists/liked/tracks", s.handleLikedTracks)
	r.Get("/api/playlists/recent/tracks", s.handleRecentTracks)
	r.Delete("/api/playlists/recent/tracks", s.handleClearRecentTracks)
	r.Post("/api/tracks/{id}/like", s.handleLikeTrack)
	r.Delete("/api/tracks/{id}/like", s.handleUnlikeTrack)
	r.Post("/api/tracks/{id}/recent-play", s.handleRecordRecentPlay)
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

func (s *Server) handleLibraries(w http.ResponseWriter, r *http.Request) {
	libraries, err := s.storage.ListLibraries(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	response := make([]libraryResponse, 0, len(libraries))
	for _, library := range libraries {
		response = append(response, libraryResponseFromStorage(library))
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleCreateLibrary(w http.ResponseWriter, r *http.Request) {
	var request createLibraryRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	path, err := validateDirectory(request.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	library, err := s.storage.CreateLibrary(r.Context(), path)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, libraryResponseFromStorage(library))
}

func (s *Server) handleDeleteLibrary(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	err = s.storage.DeleteLibrary(r.Context(), id)
	if errors.Is(err, storage.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleStartLibraryScan(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	task, err := s.scanner.Start(r.Context(), id)
	if errors.Is(err, storage.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	if errors.Is(err, storage.ErrInvalidOperation) {
		writeError(w, http.StatusConflict, errors.New("scan is already running for this library"))
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusAccepted, scanTaskResponseFromStorage(task))
}

func (s *Server) handleActiveScanTasks(w http.ResponseWriter, r *http.Request) {
	tasks, err := s.storage.ListActiveScanTasks(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	response := make([]scanTaskResponse, 0, len(tasks))
	for _, task := range tasks {
		response = append(response, scanTaskResponseFromStorage(task))
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleTracks(w http.ResponseWriter, r *http.Request) {
	s.writeTracks(w, r, func() ([]storage.Track, error) {
		return s.storage.ListTracks(r.Context(), r.URL.Query().Get("q"))
	})
}

func (s *Server) handleTrackStream(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
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

func (s *Server) handlePlaylists(w http.ResponseWriter, r *http.Request) {
	playlists, err := s.storage.ListPlaylists(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	response := make([]playlistResponse, 0, len(playlists))
	for _, playlist := range playlists {
		response = append(response, playlistResponseFromStorage(playlist))
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleCreatePlaylist(w http.ResponseWriter, r *http.Request) {
	var request playlistRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	playlist, err := s.storage.CreatePlaylist(r.Context(), request.Name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, playlistResponseFromStorage(playlist))
}

func (s *Server) handleRenamePlaylist(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var request playlistRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	playlist, err := s.storage.RenamePlaylist(r.Context(), id, request.Name)
	if errors.Is(err, storage.ErrInvalidOperation) || errors.Is(err, storage.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, playlistResponseFromStorage(playlist))
}

func (s *Server) handleDeletePlaylist(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.storage.DeletePlaylist(r.Context(), id); errors.Is(err, storage.ErrInvalidOperation) || errors.Is(err, storage.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePlaylistTracks(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	s.writeTracks(w, r, func() ([]storage.Track, error) {
		return s.storage.ListPlaylistTracks(r.Context(), id)
	})
}

func (s *Server) handleAddPlaylistTrack(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var request playlistTrackRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.storage.AddTrackToPlaylist(r.Context(), id, request.TrackID); errors.Is(err, storage.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	} else if errors.Is(err, storage.ErrInvalidOperation) {
		writeError(w, http.StatusConflict, err)
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRemovePlaylistTrack(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	trackID, err := strconv.ParseInt(chi.URLParam(r, "trackId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.storage.RemoveTrackFromPlaylist(r.Context(), id, trackID); errors.Is(err, storage.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	} else if errors.Is(err, storage.ErrInvalidOperation) {
		writeError(w, http.StatusConflict, err)
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleLikedTracks(w http.ResponseWriter, r *http.Request) {
	s.writeTracks(w, r, func() ([]storage.Track, error) {
		return s.storage.ListSystemPlaylistTracks(r.Context(), "liked")
	})
}

func (s *Server) handleRecentTracks(w http.ResponseWriter, r *http.Request) {
	s.writeTracks(w, r, func() ([]storage.Track, error) {
		return s.storage.ListSystemPlaylistTracks(r.Context(), "recent")
	})
}

func (s *Server) handleClearRecentTracks(w http.ResponseWriter, r *http.Request) {
	if err := s.storage.ClearRecentPlays(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleLikeTrack(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.storage.LikeTrack(r.Context(), id); errors.Is(err, storage.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUnlikeTrack(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.storage.UnlikeTrack(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRecordRecentPlay(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.storage.RecordRecentPlay(r.Context(), id); errors.Is(err, storage.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) writeTracks(w http.ResponseWriter, r *http.Request, load func() ([]storage.Track, error)) {
	tracks, err := load()
	if errors.Is(err, storage.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
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

func parseID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
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
	if _, err := os.ReadDir(cleanPath); err != nil {
		return "", fmt.Errorf("read directory: %w", err)
	}
	return cleanPath, nil
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

type createLibraryRequest struct {
	Path string `json:"path"`
}

type playlistRequest struct {
	Name string `json:"name"`
}

type playlistTrackRequest struct {
	TrackID int64 `json:"trackId"`
}

type librarySummaryResponse struct {
	RootCount        int64  `json:"rootCount"`
	TrackCount       int64  `json:"trackCount"`
	LatestScanStatus string `json:"latestScanStatus"`
}

type libraryResponse struct {
	ID         int64            `json:"id"`
	Path       string           `json:"path"`
	MusicCount int64            `json:"musicCount"`
	CreatedAt  string           `json:"createdAt"`
	UpdatedAt  string           `json:"updatedAt"`
	Scan       scanTaskResponse `json:"scan"`
}

type scanTaskResponse struct {
	ID           int64  `json:"id"`
	LibraryID    int64  `json:"libraryId"`
	Status       string `json:"status"`
	TotalFiles   int64  `json:"totalFiles"`
	ScannedFiles int64  `json:"scannedFiles"`
	Message      string `json:"message,omitempty"`
	CompletedAt  string `json:"completedAt,omitempty"`
}

type trackResponse struct {
	ID         int64  `json:"id"`
	Path       string `json:"path"`
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	Album      string `json:"album"`
	DurationMS int64  `json:"durationMs"`
	Format     string `json:"format"`
	Liked      bool   `json:"liked"`
}

type playlistResponse struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	TrackCount int64  `json:"trackCount"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

func libraryResponseFromStorage(library storage.Library) libraryResponse {
	return libraryResponse{
		ID:         library.ID,
		Path:       library.Path,
		MusicCount: library.MusicCount,
		CreatedAt:  library.CreatedAt,
		UpdatedAt:  library.UpdatedAt,
		Scan:       scanTaskResponseFromStorage(library.Scan),
	}
}

func scanTaskResponseFromStorage(task storage.ScanTask) scanTaskResponse {
	return scanTaskResponse{
		ID:           task.ID,
		LibraryID:    task.LibraryID,
		Status:       task.Status,
		TotalFiles:   task.TotalFiles,
		ScannedFiles: task.ScannedFiles,
		Message:      task.Message,
		CompletedAt:  task.CompletedAt,
	}
}

func trackResponseFromStorage(track storage.Track) trackResponse {
	return trackResponse{
		ID:         track.ID,
		Path:       track.Path,
		Title:      track.Title,
		Artist:     track.Artist,
		Album:      track.Album,
		DurationMS: track.DurationMS,
		Format:     track.Format,
		Liked:      track.Liked,
	}
}

func playlistResponseFromStorage(playlist storage.Playlist) playlistResponse {
	return playlistResponse{
		ID:         playlist.ID,
		Name:       playlist.Name,
		Type:       playlist.Type,
		TrackCount: playlist.TrackCount,
		CreatedAt:  playlist.CreatedAt,
		UpdatedAt:  playlist.UpdatedAt,
	}
}
