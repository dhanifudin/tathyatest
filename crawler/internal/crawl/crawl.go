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

func Role(cfg config.Config, role config.Role, client *http.Client, seeds ...string) (model.CrawlOutput, error) {
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
		for _, href := range discoveredURLs(e) {
			if href != "" && !seenPages[href] && !excluded(href, cfg) {
				_ = e.Request.Visit(href)
			}
		}
	})
	for _, seed := range crawlSeeds(cfg, seeds...) {
		if len(pages) >= cfg.Crawl.MaxPages {
			break
		}
		if seed == "" || excluded(seed, cfg) {
			continue
		}
		err := c.Visit(resolveURL(seed, cfg.BaseURL))
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

func crawlSeeds(cfg config.Config, seeds ...string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, seed := range append(append([]string{}, seeds...), append([]string{"/"}, cfg.Crawl.Include...)...) {
		normalized := normalizeURL(seed, cfg.BaseURL)
		if normalized == "" || seen[normalized] {
			continue
		}
		seen[normalized] = true
		out = append(out, normalized)
	}
	return out
}

func discoveredURLs(e *colly.HTMLElement) []string {
	out := []string{}
	add := func(raw string) {
		if normalized := normalizeURL(raw, e.Request.URL.String()); normalized != "" {
			out = append(out, normalized)
		}
	}
	e.ForEach("a[href]", func(_ int, element *colly.HTMLElement) { add(element.Attr("href")) })
	e.ForEach("form[action]", func(_ int, element *colly.HTMLElement) { add(element.Attr("action")) })
	e.ForEach("button[formaction], input[formaction]", func(_ int, element *colly.HTMLElement) {
		add(element.Attr("formaction"))
	})
	for _, attr := range []string{"data-href", "data-url", "data-route", "data-to"} {
		selector := "[" + attr + "]"
		e.ForEach(selector, func(_ int, element *colly.HTMLElement) { add(element.Attr(attr)) })
	}
	return out
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
	return false
}

func normalizeURL(raw string, base string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	baseURL, err := url.Parse(base)
	if err != nil {
		return ""
	}
	resolved := baseURL.ResolveReference(u)
	if resolved.Host != baseURL.Host || resolved.Scheme != baseURL.Scheme || (resolved.Scheme != "http" && resolved.Scheme != "https") {
		return ""
	}
	if resolved.Path == "" {
		resolved.Path = "/"
	}
	if resolved.RawQuery != "" {
		return resolved.Path + "?" + resolved.RawQuery
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
