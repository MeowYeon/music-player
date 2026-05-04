package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ayan/internal/config"
	"ayan/internal/httpapi"
	"ayan/internal/scanner"
	"ayan/internal/storage"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))
	slog.SetDefault(log)

	cfg, err := config.Load("config.yaml")
	if err != nil {
		log.Error("load config", "error", err)
		os.Exit(1)
	}

	ctx := context.Background()
	store, err := storage.Open(ctx, cfg.DatabasePath)
	if err != nil {
		log.Error("open storage", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	scanService := scanner.New(store, log)
	api := httpapi.New(store, scanService)

	server := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           api.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Info("ayan backend listening", "addr", cfg.ListenAddr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("serve http", "error", err)
			os.Exit(1)
		}
	}()

	waitForShutdown(server, log)
}

func waitForShutdown(server *http.Server, log *slog.Logger) {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	<-signals

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Error("shutdown http server", "error", err)
		return
	}
	log.Info("ayan backend stopped")
}
