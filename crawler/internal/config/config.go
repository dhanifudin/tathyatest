package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	BaseURL   string `yaml:"baseUrl"`
	Extractor struct {
		Engine string `yaml:"engine"`
	} `yaml:"extractor"`
	Auth struct {
		LoginPath     string `yaml:"loginPath"`
		UsernameField string `yaml:"usernameField"`
		PasswordField string `yaml:"passwordField"`
		Roles         []Role `yaml:"roles"`
	} `yaml:"auth"`
	Crawl struct {
		MaxDepth int      `yaml:"maxDepth"`
		MaxPages int      `yaml:"maxPages"`
		Include  []string `yaml:"include"`
		Exclude  []string `yaml:"exclude"`
	} `yaml:"crawl"`
}

type Role struct {
	Name     string `yaml:"name"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

func Load(path string) (Config, error) {
	var cfg Config
	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return cfg, err
	}
	if cfg.Crawl.MaxDepth == 0 {
		cfg.Crawl.MaxDepth = 3
	}
	if cfg.Crawl.MaxPages == 0 {
		cfg.Crawl.MaxPages = 100
	}
	return cfg, nil
}
