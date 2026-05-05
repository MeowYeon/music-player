PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS libraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS scan_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('idle', 'waiting', 'running', 'completed', 'failed')),
  total_files INTEGER NOT NULL DEFAULT 0,
  scanned_files INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS music (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  album TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  format TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mtime_unix INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS library_music (
  library_id INTEGER NOT NULL,
  music_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
  FOREIGN KEY (music_id) REFERENCES music(id) ON DELETE CASCADE,
  UNIQUE (library_id, music_id)
);

CREATE INDEX IF NOT EXISTS idx_music_title ON music(title);
CREATE INDEX IF NOT EXISTS idx_music_artist ON music(artist);
CREATE INDEX IF NOT EXISTS idx_music_album ON music(album);
CREATE INDEX IF NOT EXISTS idx_library_music_library_id ON library_music(library_id);
CREATE INDEX IF NOT EXISTS idx_library_music_music_id ON library_music(music_id);
CREATE INDEX IF NOT EXISTS idx_scan_tasks_status ON scan_tasks(status);
