package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strings"
)

type Config struct {
	ListenAddr   string
	DatabasePath string
}

func Load(path string) (Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return Config{}, fmt.Errorf("open config %q: %w", path, err)
	}
	defer file.Close()

	values := map[string]string{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, ok := strings.Cut(line, ":")
		if !ok {
			return Config{}, fmt.Errorf("invalid config line %q", line)
		}

		values[strings.TrimSpace(key)] = trimYAMLString(value)
	}
	if err := scanner.Err(); err != nil {
		return Config{}, fmt.Errorf("read config %q: %w", path, err)
	}

	cfg := Config{
		ListenAddr:   values["listen_addr"],
		DatabasePath: values["database_path"],
	}
	if cfg.ListenAddr == "" {
		return Config{}, errors.New("missing listen_addr")
	}
	if cfg.DatabasePath == "" {
		return Config{}, errors.New("missing database_path")
	}

	return cfg, nil
}

func trimYAMLString(value string) string {
	value = strings.TrimSpace(value)
	value = strings.Trim(value, `"`)
	value = strings.Trim(value, `'`)
	return value
}

