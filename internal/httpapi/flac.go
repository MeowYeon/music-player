package httpapi

import (
	"bytes"
	"fmt"
	"io"
)

const (
	flacMetadataTypeStreamInfo = 0
)

func readMinimalFLAC(reader io.Reader) ([]byte, bool, error) {
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, false, fmt.Errorf("read flac: %w", err)
	}
	return stripFLACMetadata(data)
}

func stripFLACMetadata(data []byte) ([]byte, bool, error) {
	if len(data) < 4 || !bytes.Equal(data[:4], []byte("fLaC")) {
		return data, false, nil
	}

	position := 4
	var streamInfo []byte
	hasNonStreamInfoMetadata := false

	for {
		if position+4 > len(data) {
			return nil, false, fmt.Errorf("invalid flac metadata header")
		}

		header := data[position]
		metadataType := header & 0x7f
		length := int(data[position+1])<<16 | int(data[position+2])<<8 | int(data[position+3])
		payloadStart := position + 4
		payloadEnd := payloadStart + length
		if payloadEnd > len(data) {
			return nil, false, fmt.Errorf("invalid flac metadata block length")
		}

		if metadataType == flacMetadataTypeStreamInfo {
			if streamInfo != nil {
				return nil, false, fmt.Errorf("invalid flac duplicate streaminfo")
			}
			streamInfo = data[payloadStart:payloadEnd]
		} else {
			hasNonStreamInfoMetadata = true
		}

		position = payloadEnd
		if header&0x80 != 0 {
			break
		}
	}

	if !hasNonStreamInfoMetadata {
		return data, false, nil
	}
	if streamInfo == nil {
		return nil, false, fmt.Errorf("invalid flac streaminfo")
	}

	output := make([]byte, 0, len(data))
	output = append(output, data[:4]...)
	output = append(output, 0x80|flacMetadataTypeStreamInfo)
	output = append(output, byte(len(streamInfo)>>16), byte(len(streamInfo)>>8), byte(len(streamInfo)))
	output = append(output, streamInfo...)
	output = append(output, data[position:]...)
	return output, true, nil
}
