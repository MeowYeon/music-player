package metadata

import (
	"fmt"
	"os"

	"github.com/dhowden/tag"
)

func Read(path string) (TrackMetadata, error) {
	file, err := os.Open(path)
	if err != nil {
		return TrackMetadata{}, fmt.Errorf("open audio file: %w", err)
	}
	defer file.Close()

	meta, err := tag.ReadFrom(file)
	if err != nil {
		return TrackMetadata{}, fmt.Errorf("read audio tags: %w", err)
	}

	return TrackMetadata{
		Title:  meta.Title(),
		Artist: meta.Artist(),
		Album:  meta.Album(),
	}, nil
}
