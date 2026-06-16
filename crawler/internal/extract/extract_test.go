package extract

import (
	"net/url"
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

func TestLocatorInfersTextboxRoleFromAriaLabel(t *testing.T) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(`<html><body><input aria-label="Search"></body></html>`))
	if err != nil {
		t.Fatalf("failed to parse html: %v", err)
	}

	loc := locator(doc.Find("input"), "")
	if loc.Strategy != "role" || loc.Value != "textbox:Search" {
		t.Fatalf("expected textbox role locator, got %#v", loc)
	}
}

func TestPagePreservesQueryStringsForURLs(t *testing.T) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(`<html><head><title>Links</title></head><body>
		<a href="/inventory.html?sort=az#items">Inventory</a>
		<a href="https://external.test/ignored">External</a>
		<form action="/cart.html?from=inventory"></form>
	</body></html>`))
	if err != nil {
		t.Fatalf("failed to parse html: %v", err)
	}
	current := mustURL(t, "http://example.test/dashboard?tab=home#top")

	page := Page(doc.Selection, current, "http://example.test")

	if page.URL != "/dashboard?tab=home" {
		t.Fatalf("expected page URL to preserve query and drop hash, got %q", page.URL)
	}
	if len(page.Links) != 1 || page.Links[0].Href != "/inventory.html?sort=az" {
		t.Fatalf("expected one internal query-preserving link, got %#v", page.Links)
	}
	if len(page.Forms) != 1 || page.Forms[0].Action != "/cart.html?from=inventory" {
		t.Fatalf("expected query-preserving form action, got %#v", page.Forms)
	}
}

func TestLocatorUsesStableAncestorForCssFallback(t *testing.T) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(`<html><body><div id="wrapper"><span></span></div></body></html>`))
	if err != nil {
		t.Fatalf("failed to parse html: %v", err)
	}

	loc := locator(doc.Find("span"), "")
	if loc.Strategy != "css" || loc.Value != "#wrapper span" {
		t.Fatalf("expected stable ancestor css locator, got %#v", loc)
	}
}

func mustURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("failed to parse url: %v", err)
	}
	return parsed
}
