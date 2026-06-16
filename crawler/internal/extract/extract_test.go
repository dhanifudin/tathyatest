package extract

import (
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
