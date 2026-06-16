package auth

import (
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/polinema/tathyatest/crawler/internal/config"
)

func Login(cfg config.Config, role config.Role) (*http.Client, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Jar: jar}
	loginURL := strings.TrimRight(cfg.BaseURL, "/") + cfg.Auth.LoginPath
	resp, err := client.Get(loginURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}
	token, _ := doc.Find(`input[name="_token"]`).Attr("value")
	values := url.Values{}
	values.Set(cfg.Auth.UsernameField, role.Username)
	values.Set(cfg.Auth.PasswordField, role.Password)
	if token != "" {
		values.Set("_token", token)
	}
	req, err := http.NewRequest(http.MethodPost, loginURL, strings.NewReader(values.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Referer", loginURL)
	resp, err = client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return client, nil
}
