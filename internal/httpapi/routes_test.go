package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"ayan/internal/storage"
)

func TestTrackStreamSetsAudioContentTypeForFlac(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "坏女孩 - 徐良&小凌.flac")
	content := flacFixture(
		flacBlock{metadataType: flacMetadataTypeStreamInfo, payload: []byte("streaminfo payload must be long enough")},
	)
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	server := New(fakeStorage{trackPath: path}, nil)
	request := httptest.NewRequest(http.MethodGet, "/api/tracks/42/stream", nil)
	response := httptest.NewRecorder()

	server.Routes().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Content-Type"); got != "audio/flac" {
		t.Fatalf("expected audio/flac content type, got %q", got)
	}
}

func TestTrackStreamKeepsOnlyRequiredFlacMetadata(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "坏女孩 - 徐良&小凌.flac")
	content := flacFixture(
		flacBlock{metadataType: flacMetadataTypeStreamInfo, payload: []byte("streaminfo payload must be long enough")},
		flacBlock{metadataType: 4, payload: []byte("artist=徐良&小凌")},
		flacBlock{metadataType: 6, payload: []byte{0xff, 0xff, 0xff, 0xff, 'P', 'N', 'G'}},
		flacBlock{metadataType: 3, payload: []byte("seektable")},
	)
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	server := New(fakeStorage{trackPath: path}, nil)
	request := httptest.NewRequest(http.MethodGet, "/api/tracks/42/stream", nil)
	response := httptest.NewRecorder()

	server.Routes().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Content-Type"); got != "audio/flac" {
		t.Fatalf("expected audio/flac content type, got %q", got)
	}
	body := response.Body.Bytes()
	if len(body) >= len(content) {
		t.Fatalf("expected stripped response to be smaller than source")
	}
	if _, stripped, err := stripFLACMetadata(body); err != nil || stripped {
		t.Fatalf("expected response to contain only required metadata, stripped=%v err=%v", stripped, err)
	}
}

func TestTrackStreamSupportsRangesAfterStrippingFlacMetadata(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "坏女孩 - 徐良&小凌.flac")
	content := flacFixture(
		flacBlock{metadataType: flacMetadataTypeStreamInfo, payload: []byte("streaminfo payload must be long enough")},
		flacBlock{metadataType: 6, payload: []byte("bad picture")},
	)
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	server := New(fakeStorage{trackPath: path}, nil)
	request := httptest.NewRequest(http.MethodGet, "/api/tracks/42/stream", nil)
	request.Header.Set("Range", "bytes=0-3")
	response := httptest.NewRecorder()

	server.Routes().ServeHTTP(response, request)

	if response.Code != http.StatusPartialContent {
		t.Fatalf("expected 206, got %d: %s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Content-Range"); got == "" {
		t.Fatalf("expected content range header")
	}
	if body := response.Body.String(); body != "fLaC" {
		t.Fatalf("expected first four bytes of stripped flac, got %q", body)
	}
}

type flacBlock struct {
	metadataType byte
	payload      []byte
}

func flacFixture(blocks ...flacBlock) []byte {
	output := []byte("fLaC")
	for index, block := range blocks {
		header := block.metadataType
		if index == len(blocks)-1 {
			header |= 0x80
		}
		output = append(output, header)
		output = append(output, byte(len(block.payload)>>16), byte(len(block.payload)>>8), byte(len(block.payload)))
		output = append(output, block.payload...)
	}
	output = append(output, []byte("audioframes")...)
	return output
}

type fakeStorage struct {
	trackPath string
}

func (f fakeStorage) GetLibrarySummary(context.Context) (storage.LibrarySummary, error) {
	return storage.LibrarySummary{}, nil
}
func (f fakeStorage) CreateLibrary(context.Context, string) (storage.Library, error) {
	return storage.Library{}, nil
}
func (f fakeStorage) ListLibraries(context.Context) ([]storage.Library, error) { return nil, nil }
func (f fakeStorage) DeleteLibrary(context.Context, int64) error               { return nil }
func (f fakeStorage) ListActiveScanTasks(context.Context) ([]storage.ScanTask, error) {
	return nil, nil
}
func (f fakeStorage) ListTracks(context.Context, string) ([]storage.Track, error) { return nil, nil }
func (f fakeStorage) GetTrackPath(context.Context, int64) (string, error)         { return f.trackPath, nil }
func (f fakeStorage) ListPlaylists(context.Context) ([]storage.Playlist, error)   { return nil, nil }
func (f fakeStorage) CreatePlaylist(context.Context, string) (storage.Playlist, error) {
	return storage.Playlist{}, nil
}
func (f fakeStorage) RenamePlaylist(context.Context, int64, string) (storage.Playlist, error) {
	return storage.Playlist{}, nil
}
func (f fakeStorage) DeletePlaylist(context.Context, int64) error { return nil }
func (f fakeStorage) ListPlaylistTracks(context.Context, int64) ([]storage.Track, error) {
	return nil, nil
}
func (f fakeStorage) AddTrackToPlaylist(context.Context, int64, int64) error      { return nil }
func (f fakeStorage) RemoveTrackFromPlaylist(context.Context, int64, int64) error { return nil }
func (f fakeStorage) ListSystemPlaylistTracks(context.Context, string) ([]storage.Track, error) {
	return nil, nil
}
func (f fakeStorage) LikeTrack(context.Context, int64) error        { return nil }
func (f fakeStorage) UnlikeTrack(context.Context, int64) error      { return nil }
func (f fakeStorage) RecordRecentPlay(context.Context, int64) error { return nil }
func (f fakeStorage) ClearRecentPlays(context.Context) error        { return nil }
