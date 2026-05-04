package storage

import (
	"embed"
	"fmt"
)

//go:embed schema.sql queries.sql
var sqlFiles embed.FS

func SchemaSQL() (string, error) {
	return readSQLFile("schema.sql")
}

func QueriesSQL() (string, error) {
	return readSQLFile("queries.sql")
}

func readSQLFile(name string) (string, error) {
	data, err := sqlFiles.ReadFile(name)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", name, err)
	}
	return string(data), nil
}

