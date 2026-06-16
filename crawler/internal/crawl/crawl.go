package crawl

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gocolly/colly/v2"
	"github.com/polinema/tathyatest/crawler/internal/config"
	"github.com/polinema/tathyatest/crawler/internal/extract"
	"github.com/polinema/tathyatest/crawler/internal/model"
)

func Role(cfg config.Config, role config.Role, client *http.Client) (model.CrawlOutput, error) {
	pages := []model.Page{}
	seenPages := map[string]bool{}
	c := colly.NewCollector(
		colly.AllowedDomains(hostOnly(cfg.BaseURL)),
		colly.MaxDepth(cfg.Crawl.MaxDepth),
	)
	c.SetClient(client)
	c.OnHTML("html", func(e *colly.HTMLElement) {
		path := normalizeURL(e.Request.URL.String(), cfg.BaseURL)
		if seenPages[path] || excluded(path, cfg) || len(pages) >= cfg.Crawl.MaxPages {
			return
		}
		seenPages[path] = true
		page := extract.Page(e.DOM, e.Request.URL, cfg.BaseURL)
		pages = append(pages, page)
		e.ForEach("a[href]", func(_ int, link *colly.HTMLElement) {
			href := normalizeURL(link.Attr("href"), cfg.BaseURL)
			if href != "" && !seenPages[href] && !excluded(href, cfg) {
				_ = e.Request.Visit(href)
			}
		})
	})
	err := c.Visit(cfg.BaseURL)
	if err != nil && !strings.Contains(err.Error(), "Max depth") {
		return model.CrawlOutput{}, err
	}
	for _, include := range cfg.Crawl.Include {
		if len(pages) >= cfg.Crawl.MaxPages {
			break
		}
		if include == "" || excluded(include, cfg) {
			continue
		}
		err := c.Visit(resolveURL(include, cfg.BaseURL))
		if err != nil && !isBenignVisitError(err) {
			return model.CrawlOutput{}, err
		}
	}
	return model.CrawlOutput{
		BaseURL:   cfg.BaseURL,
		Engine:    "static",
		Role:      role.Name,
		CrawledAt: time.Now().UTC().Format(time.RFC3339),
		Pages:     pages,
	}, nil
}

func isBenignVisitError(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "already visited") ||
		strings.Contains(message, "max depth") ||
		strings.Contains(message, "not found")
}

func excluded(path string, cfg config.Config) bool {
	for _, prefix := range cfg.Crawl.Exclude {
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}
	if path == "/" || len(cfg.Crawl.Include) == 0 {
		return false
	}
	for _, prefix := range cfg.Crawl.Include {
		if strings.HasPrefix(path, prefix) {
			return false
		}
	}
	return true
}

func normalizeURL(raw string, base string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	baseURL, err := url.Parse(base)
	if err != nil {
		return ""
	}
	resolved := baseURL.ResolveReference(u)
	if resolved.Host != baseURL.Host {
		return ""
	}
	return resolved.Path
}

func resolveURL(raw string, base string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	baseURL, err := url.Parse(base)
	if err != nil {
		return raw
	}
	return baseURL.ResolveReference(u).String()
}

func hostOnly(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	return u.Hostname()
}
