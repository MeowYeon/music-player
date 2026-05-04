package metadata

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/dhowden/tag"
)

func Read(path string) (TrackMetadata, error) {
	durationMS := EstimateDurationMS(path)

	file, err := os.Open(path)
	if err != nil {
		return TrackMetadata{}, fmt.Errorf("open audio file: %w", err)
	}
	defer file.Close()

	meta, err := tag.ReadFrom(file)
	if err != nil {
		return TrackMetadata{DurationMS: durationMS}, fmt.Errorf("read audio tags: %w", err)
	}

	return TrackMetadata{
		Title:      meta.Title(),
		Artist:     meta.Artist(),
		Album:      meta.Album(),
		DurationMS: durationMS,
	}, nil
}

func EstimateDurationMS(path string) int64 {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".mp3":
		return estimateMP3DurationMS(path)
	default:
		return 0
	}
}

func estimateMP3DurationMS(path string) int64 {
	data, err := os.ReadFile(path)
	if err != nil || len(data) < 4 {
		return 0
	}

	offset := skipID3v2(data)
	for offset+4 <= len(data) {
		header := uint32(data[offset])<<24 | uint32(data[offset+1])<<16 | uint32(data[offset+2])<<8 | uint32(data[offset+3])
		bitrate := mp3Bitrate(header)
		if bitrate > 0 {
			audioBytes := len(data) - offset
			durationSeconds := float64(audioBytes*8) / float64(bitrate*1000)
			return int64(durationSeconds * 1000)
		}
		offset++
	}
	return 0
}

func skipID3v2(data []byte) int {
	if len(data) < 10 || string(data[:3]) != "ID3" {
		return 0
	}
	size := int(data[6]&0x7f)<<21 | int(data[7]&0x7f)<<14 | int(data[8]&0x7f)<<7 | int(data[9]&0x7f)
	return 10 + size
}

func mp3Bitrate(header uint32) int {
	if header&0xffe00000 != 0xffe00000 {
		return 0
	}

	versionID := (header >> 19) & 0x3
	layer := (header >> 17) & 0x3
	bitrateIndex := (header >> 12) & 0xf
	if versionID == 1 || layer == 0 || bitrateIndex == 0 || bitrateIndex == 0xf {
		return 0
	}

	// The MVP scanner only needs a practical duration estimate. These MPEG
	// tables cover common MP3 files and browser playback remains authoritative.
	if layer == 1 {
		if versionID == 3 {
			return []int{0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448}[int(bitrateIndex)]
		}
		return []int{0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256}[int(bitrateIndex)]
	}

	if versionID == 3 && layer == 3 {
		return []int{0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384}[int(bitrateIndex)]
	}
	if versionID == 3 && layer == 2 {
		return []int{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320}[int(bitrateIndex)]
	}
	return []int{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160}[int(bitrateIndex)]
}
