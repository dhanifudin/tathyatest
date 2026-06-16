package crawl

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/polinema/tathyatest/crawler/internal/config"
)

func TestRoleVisitsConfiguredIncludePaths(t *testing.T) {
	client := &http.Client{Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/":
			return htmlResponse(req, "<html><head><title>Home</title></head><body>Home</body></html>"), nil
		case "/seed":
			return htmlResponse(req, "<html><head><title>Seed</title></head><body>Seed</body></html>"), nil
		default:
			return htmlResponse(req, "<html><head><title>Not Found</title></head><body>Not Found</body></html>", http.StatusNotFound), nil
		}
	})}

	cfg := config.Config{
		BaseURL: "http://example.test",
	}
	cfg.Crawl.MaxDepth = 1
	cfg.Crawl.MaxPages = 10
	cfg.Crawl.Include = []string{"/seed"}

	out, err := Role(cfg, config.Role{Name: "admin"}, client)
	if err != nil {
		t.Fatalf("Role returned error: %v", err)
	}

	got := map[string]bool{}
	for _, page := range out.Pages {
		got[page.URL] = true
	}

	if !got["/"] {
		t.Fatalf("expected root page to be crawled, got %v", got)
	}
	if !got["/seed"] {
		t.Fatalf("expected include path /seed to be crawled, got %v", got)
	}
	if len(got) != 2 {
		t.Fatalf("expected exactly two unique pages, got %v", got)
	}
}

func TestRoleStartsFromLandingPathAndDiscoversInternalURLs(t *testing.T) {
	client := &http.Client{Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.RequestURI() {
		case "/dashboard":
			return htmlResponse(req, `<html><head><title>Dashboard</title></head><body>
				<a href="/inventory.html?sort=az#items">Inventory</a>
				<form action="/cart.html?from=dashboard"></form>
				<button formaction="/checkout.html">Checkout</button>
				<div data-href="/inventory-item.html?id=1#details"></div>
				<a href="https://external.test/ignored">External</a>
			</body></html>`), nil
		case "/":
			return htmlResponse(req, "<html><head><title>Home</title></head><body>Home</body></html>"), nil
		case "/inventory.html?sort=az":
			return htmlResponse(req, "<html><head><title>Inventory</title></head><body>Inventory</body></html>"), nil
		case "/cart.html?from=dashboard":
			return htmlResponse(req, "<html><head><title>Cart</title></head><body>Cart</body></html>"), nil
		case "/checkout.html":
			return htmlResponse(req, "<html><head><title>Checkout</title></head><body>Checkout</body></html>"), nil
		case "/inventory-item.html?id=1":
			return htmlResponse(req, "<html><head><title>Item</title></head><body>Item</body></html>"), nil
		default:
			return htmlResponse(req, "<html><head><title>Not Found</title></head><body>Not Found</body></html>", http.StatusNotFound), nil
		}
	})}

	cfg := config.Config{BaseURL: "http://example.test"}
	cfg.Crawl.MaxDepth = 5
	cfg.Crawl.MaxPages = 10

	out, err := Role(cfg, config.Role{Name: "admin"}, client, "/dashboard")
	if err != nil {
		t.Fatalf("Role returned error: %v", err)
	}

	if len(out.Pages) == 0 || out.Pages[0].URL != "/dashboard" {
		t.Fatalf("expected landing path to be crawled first, got %#v", out.Pages)
	}
	got := map[string]bool{}
	for _, page := range out.Pages {
		got[page.URL] = true
	}
	for _, expected := range []string{
		"/dashboard",
		"/",
		"/inventory.html?sort=az",
		"/cart.html?from=dashboard",
		"/checkout.html",
		"/inventory-item.html?id=1",
	} {
		if !got[expected] {
			t.Fatalf("expected %s to be crawled, got %v", expected, got)
		}
	}
	if got["/ignored"] {
		t.Fatalf("external URL should not be crawled, got %v", got)
	}
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (fn roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func htmlResponse(req *http.Request, body string, statusCodes ...int) *http.Response {
	statusCode := http.StatusOK
	if len(statusCodes) > 0 {
		statusCode = statusCodes[0]
	}
	return &http.Response{
		StatusCode: statusCode,
		Status:     fmt.Sprintf("%d %s", statusCode, http.StatusText(statusCode)),
		Header:     http.Header{"Content-Type": []string{"text/html; charset=utf-8"}},
		Body:       io.NopCloser(strings.NewReader(body)),
		Request:    req,
	}
}
