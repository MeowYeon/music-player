package storage

import (
	"context"
	"path/filepath"
	"testing"
)

func TestClearRecentPlaysOnlyClearsRecentPlaylist(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "music.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()

	library, err := store.CreateLibrary(ctx, t.TempDir())
	if err != nil {
		t.Fatalf("create library: %v", err)
	}
	track := MusicInput{
		Path:       filepath.Join(t.TempDir(), "song.mp3"),
		Title:      "Song",
		Artist:     "Artist",
		Album:      "Album",
		DurationMS: 120000,
		Format:     "mp3",
		SizeBytes:  1234,
		MTimeUnix:  1700000000,
	}
	if err := store.ReplaceMusicForLibrary(ctx, library.ID, []MusicInput{track}); err != nil {
		t.Fatalf("replace music: %v", err)
	}

	tracks, err := store.ListTracks(ctx, "")
	if err != nil {
		t.Fatalf("list tracks: %v", err)
	}
	if len(tracks) != 1 {
		t.Fatalf("expected 1 track, got %d", len(tracks))
	}
	trackID := tracks[0].ID

	playlist, err := store.CreatePlaylist(ctx, "Favorites")
	if err != nil {
		t.Fatalf("create playlist: %v", err)
	}
	if err := store.AddTrackToPlaylist(ctx, playlist.ID, trackID); err != nil {
		t.Fatalf("add to playlist: %v", err)
	}
	if err := store.LikeTrack(ctx, trackID); err != nil {
		t.Fatalf("like track: %v", err)
	}
	if err := store.RecordRecentPlay(ctx, trackID); err != nil {
		t.Fatalf("record recent play: %v", err)
	}

	if err := store.ClearRecentPlays(ctx); err != nil {
		t.Fatalf("clear recent plays: %v", err)
	}

	recentTracks, err := store.ListSystemPlaylistTracks(ctx, "recent")
	if err != nil {
		t.Fatalf("list recent tracks: %v", err)
	}
	if len(recentTracks) != 0 {
		t.Fatalf("expected no recent tracks, got %d", len(recentTracks))
	}

	likedTracks, err := store.ListSystemPlaylistTracks(ctx, "liked")
	if err != nil {
		t.Fatalf("list liked tracks: %v", err)
	}
	if len(likedTracks) != 1 {
		t.Fatalf("expected liked track to remain, got %d", len(likedTracks))
	}

	playlistTracks, err := store.ListPlaylistTracks(ctx, playlist.ID)
	if err != nil {
		t.Fatalf("list playlist tracks: %v", err)
	}
	if len(playlistTracks) != 1 {
		t.Fatalf("expected normal playlist track to remain, got %d", len(playlistTracks))
	}
}

func TestListRecentTrackItemsIncludesLastPlayedAt(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "music.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()

	library, err := store.CreateLibrary(ctx, t.TempDir())
	if err != nil {
		t.Fatalf("create library: %v", err)
	}
	input := MusicInput{
		Path:       filepath.Join(t.TempDir(), "recent.mp3"),
		Title:      "Recent",
		Artist:     "Artist",
		Album:      "Album",
		DurationMS: 90000,
		Format:     "mp3",
		SizeBytes:  1234,
		MTimeUnix:  1700000000,
	}
	if err := store.ReplaceMusicForLibrary(ctx, library.ID, []MusicInput{input}); err != nil {
		t.Fatalf("replace music: %v", err)
	}
	tracks, err := store.ListTracks(ctx, "")
	if err != nil {
		t.Fatalf("list tracks: %v", err)
	}
	if err := store.RecordRecentPlay(ctx, tracks[0].ID); err != nil {
		t.Fatalf("record recent play: %v", err)
	}

	items, err := store.ListRecentTrackItems(ctx)
	if err != nil {
		t.Fatalf("list recent track items: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 recent item, got %d", len(items))
	}
	if items[0].Track.ID != tracks[0].ID {
		t.Fatalf("expected track id %d, got %d", tracks[0].ID, items[0].Track.ID)
	}
	if items[0].LastPlayedAt == "" {
		t.Fatal("expected last played timestamp")
	}
}
