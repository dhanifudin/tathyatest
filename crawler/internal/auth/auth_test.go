package auth

import (
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

func TestLoginFieldsInferSauceDemoNames(t *testing.T) {
	doc := mustDocument(t, `
		<form>
			<input type="text" name="user-name" placeholder="Username" data-test="username">
			<input type="password" name="password" placeholder="Password" data-test="password">
		</form>
	`)

	if got := inferredUsernameName(doc); got != "user-name" {
		t.Fatalf("expected username field user-name, got %q", got)
	}
	if got := inferredPasswordName(doc); got != "password" {
		t.Fatalf("expected password field password, got %q", got)
	}
}

func TestLoginFieldsFallbackToConventionalNames(t *testing.T) {
	doc := mustDocument(t, `<form><input type="hidden" name="_token"></form>`)

	if got := inferredUsernameName(doc); got != "email" {
		t.Fatalf("expected username fallback email, got %q", got)
	}
	if got := inferredPasswordName(doc); got != "password" {
		t.Fatalf("expected password fallback password, got %q", got)
	}
}

func mustDocument(t *testing.T, html string) *goquery.Document {
	t.Helper()
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		t.Fatalf("failed to parse html: %v", err)
	}
	return doc
}
