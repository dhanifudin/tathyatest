package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/polinema/tathyatest/crawler/internal/auth"
	"github.com/polinema/tathyatest/crawler/internal/config"
	"github.com/polinema/tathyatest/crawler/internal/crawl"
)

func main() {
	cfg, err := config.Load("tathya.config.yaml")
	if err != nil {
		log.Fatal(err)
	}
	if err := os.MkdirAll("crawl", 0o755); err != nil {
		log.Fatal(err)
	}
	for _, role := range cfg.Auth.Roles {
		client, landingPath, err := auth.Login(cfg, role)
		if err != nil {
			log.Fatal(err)
		}
		output, err := crawl.Role(cfg, role, client, landingPath)
		if err != nil {
			log.Fatal(err)
		}
		data, err := json.MarshalIndent(output, "", "  ")
		if err != nil {
			log.Fatal(err)
		}
		path := filepath.Join("crawl", role.Name+".json")
		if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
			log.Fatal(err)
		}
		fmt.Println("wrote", path)
	}
}
