package httpapi

import "net/http"

type Server struct {
	storage Storage
	scanner Scanner
}

type Storage interface{}

type Scanner interface{}

func New(storage Storage, scanner Scanner) *Server {
	return &Server{
		storage: storage,
		scanner: scanner,
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.handleHealth)
	return mux
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

