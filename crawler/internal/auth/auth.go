package auth

import (
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/polinema/tathyatest/crawler/internal/config"
)

func Login(cfg config.Config, role config.Role) (*http.Client, string, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, "", err
	}
	client := &http.Client{Jar: jar}
	loginURL := strings.TrimRight(cfg.BaseURL, "/") + cfg.Auth.LoginPath
	resp, err := client.Get(loginURL)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, "", err
	}
	token, _ := doc.Find(`input[name="_token"]`).Attr("value")
	values := url.Values{}
	values.Set(inferredUsernameName(doc), role.Username)
	values.Set(inferredPasswordName(doc), role.Password)
	if token != "" {
		values.Set("_token", token)
	}
	req, err := http.NewRequest(http.MethodPost, loginURL, strings.NewReader(values.Encode()))
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Referer", loginURL)
	resp, err = client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	landingPath := "/"
	if resp.Request != nil && resp.Request.URL != nil {
		landingPath = resp.Request.URL.RequestURI()
	}
	return client, landingPath, nil
}

func inferredUsernameName(doc *goquery.Document) string {
	type candidate struct {
		name  string
		score int
		index int
	}
	candidates := []candidate{}
	doc.Find("input").Each(func(index int, input *goquery.Selection) {
		name, ok := input.Attr("name")
		if !ok || name == "" {
			return
		}
		typ := strings.ToLower(attrDefault(input, "type", "text"))
		if typ == "hidden" || typ == "password" || typ == "submit" || typ == "button" || typ == "reset" || typ == "image" || typ == "file" {
			return
		}
		text := strings.ToLower(strings.Join([]string{
			typ,
			name,
			attrDefault(input, "id", ""),
			attrDefault(input, "placeholder", ""),
			attrDefault(input, "autocomplete", ""),
			attrDefault(input, "aria-label", ""),
			attrDefault(input, "data-test", ""),
			attrDefault(input, "data-testid", ""),
		}, " "))
		score := 0
		if typ == "email" {
			score += 100
		}
		if attrDefault(input, "autocomplete", "") == "username" {
			score += 90
		}
		if attrDefault(input, "autocomplete", "") == "email" {
			score += 80
		}
		if strings.Contains(text, "email") || strings.Contains(text, "username") || strings.Contains(text, "user") || strings.Contains(text, "account") || strings.Contains(text, "identifier") || strings.Contains(text, "handle") {
			score += 50
		}
		candidates = append(candidates, candidate{name: name, score: score, index: index})
	})
	if len(candidates) == 0 {
		return "email"
	}
	best := candidates[0]
	for _, current := range candidates[1:] {
		if current.score > best.score || (current.score == best.score && current.index < best.index) {
			best = current
		}
	}
	return best.name
}

func inferredPasswordName(doc *goquery.Document) string {
	password := doc.Find(`input[type="password"][name]`).First()
	if name, ok := password.Attr("name"); ok && name != "" {
		return name
	}
	return "password"
}

func attrDefault(selection *goquery.Selection, name string, fallback string) string {
	if value, ok := selection.Attr(name); ok {
		return value
	}
	return fallback
}
