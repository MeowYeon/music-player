package main

import (
	"log/slog"
	"os"

	"ayan/internal/config"
)

func main() {
	cfg, err := config.Load("config.yaml")
	if err != nil {
		slog.Error("load config", "error", err)
		os.Exit(1)
	}

	slog.Info(
		"ayan backend scaffold ready",
		"listen_addr", cfg.ListenAddr,
		"database_path", cfg.DatabasePath,
	)
}

