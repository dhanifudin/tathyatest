package extract

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/polinema/tathyatest/crawler/internal/model"
)

func Page(doc *goquery.Selection, current *url.URL, base string) model.Page {
	return model.Page{
		URL:     normalizeURL(current.String(), base),
		Title:   clean(doc.Find("title").First().Text()),
		Forms:   forms(doc, current),
		Links:   links(doc, current),
		Buttons: buttons(doc),
		Tables:  tables(doc),
	}
}

func forms(doc *goquery.Selection, current *url.URL) []model.Form {
	out := []model.Form{}
	doc.Find("form").Each(func(_ int, form *goquery.Selection) {
		method := strings.ToUpper(attrDefault(form, "method", "GET"))
		if method != "GET" {
			method = "POST"
		}
		action := attrDefault(form, "action", current.Path)
		resolved := current.ResolveReference(mustParse(action))
		actionPath := resolved.Path
		if resolved.RawQuery != "" {
			actionPath += "?" + resolved.RawQuery
		}
		submit := form.Find(`button[type="submit"], input[type="submit"], button:not([type])`).First()
		submitText := nullable(clean(submit.Text()))
		if value, ok := submit.Attr("value"); ok && submitText == nil {
			submitText = nullable(value)
		}
		out = append(out, model.Form{
			Action:     actionPath,
			Method:     method,
			CrudOp:     crudOp(form, method),
			NoValidate: hasAttr(form, "novalidate"),
			Fields:     fields(form),
			Submit: model.Submit{
				Text:    submitText,
				Locator: locator(submit, "button"),
			},
		})
	})
	return out
}

func fields(form *goquery.Selection) []model.Field {
	out := []model.Field{}
	form.Find("input, select, textarea").Each(func(_ int, field *goquery.Selection) {
		name, ok := field.Attr("name")
		if !ok || name == "" {
			return
		}
		typ := strings.ToLower(attrDefault(field, "type", "text"))
		if typ == "hidden" || typ == "submit" || typ == "button" {
			return
		}
		if goquery.NodeName(field) == "textarea" {
			typ = "textarea"
		}
		if goquery.NodeName(field) == "select" {
			typ = "select"
		}
		options := []model.Option(nil)
		if goquery.NodeName(field) == "select" {
			options = []model.Option{}
			field.Find("option").Each(func(_ int, option *goquery.Selection) {
				options = append(options, model.Option{Value: attrDefault(option, "value", clean(option.Text())), Label: clean(option.Text())})
			})
		}
		nameHints := []string{}
		if strings.HasSuffix(name, "_confirmation") {
			nameHints = append(nameHints, "confirmation")
		}
		loc := locator(field, "")
		label := (*string)(nil)
		if loc.Strategy == "label" {
			label = &loc.Value
		}
		out = append(out, model.Field{
			Name:        name,
			Type:        typ,
			Label:       label,
			Required:    hasAttr(field, "required"),
			Constraints: constraints(field),
			Options:     options,
			NameHints:   nameHints,
			Locator:     loc,
		})
	})
	return out
}

func constraints(s *goquery.Selection) model.Constraints {
	return model.Constraints{
		MinLength: intPtrAttr(s, "minlength"),
		MaxLength: intPtrAttr(s, "maxlength"),
		Min:       strPtrAttr(s, "min"),
		Max:       strPtrAttr(s, "max"),
		Step:      strPtrAttr(s, "step"),
		Pattern:   strPtrAttr(s, "pattern"),
		InputMode: strPtrAttr(s, "inputmode"),
		Accept:    strPtrAttr(s, "accept"),
	}
}

func links(doc *goquery.Selection, current *url.URL) []model.Link {
	out := []model.Link{}
	doc.Find("a[href]").Each(func(_ int, link *goquery.Selection) {
		href := normalizeURL(attrDefault(link, "href", ""), current.String())
		if href == "" {
			return
		}
		out = append(out, model.Link{Href: href, Text: clean(link.Text()), Locator: locator(link, "link")})
	})
	return out
}

func buttons(doc *goquery.Selection) []model.Button {
	out := []model.Button{}
	doc.Find("button").Each(func(_ int, button *goquery.Selection) {
		out = append(out, model.Button{Text: clean(button.Text()), Locator: locator(button, "button")})
	})
	return out
}

func tables(doc *goquery.Selection) []model.Table {
	out := []model.Table{}
	doc.Find("table").Each(func(_ int, table *goquery.Selection) {
		headers := []string{}
		table.Find("th").Each(func(_ int, th *goquery.Selection) { headers = append(headers, clean(th.Text())) })
		out = append(out, model.Table{Headers: headers, RowCount: table.Find("tbody tr").Length()})
	})
	return out
}

func locator(s *goquery.Selection, role string) model.Locator {
	if s == nil || s.Length() == 0 {
		return model.Locator{Strategy: "css", Value: `button[type="submit"]`}
	}
	if testid, ok := s.Attr("data-testid"); ok && testid != "" {
		return model.Locator{Strategy: "testid", Value: testid}
	}
	if role == "" {
		role = inferredRole(s)
	}
	name := firstNonEmpty(attrDefault(s, "aria-label", ""), clean(s.Text()))
	if role != "" && name != "" {
		isExplicitRole := role == "button" || role == "link" || attrDefault(s, "aria-label", "") != ""
		if isExplicitRole {
			return model.Locator{Strategy: "role", Value: role + ":" + name}
		}
	}
	if id, ok := s.Attr("id"); ok && id != "" {
		label := s.Closest("html").Find(`label[for="` + cssEscape(id) + `"]`).First()
		if txt := clean(label.Text()); txt != "" {
			return model.Locator{Strategy: "label", Value: txt}
		}
	}
	if label := clean(s.ParentsFiltered("label").First().Text()); label != "" {
		return model.Locator{Strategy: "label", Value: label}
	}
	if placeholder, ok := s.Attr("placeholder"); ok && placeholder != "" {
		return model.Locator{Strategy: "placeholder", Value: placeholder}
	}
	if id, ok := s.Attr("id"); ok && stableID(id) {
		return model.Locator{Strategy: "id", Value: id}
	}
	if nameAttr, ok := s.Attr("name"); ok && nameAttr != "" {
		return model.Locator{Strategy: "name", Value: nameAttr}
	}
	return model.Locator{Strategy: "css", Value: cssFallback(s)}
}

func inferredRole(s *goquery.Selection) string {
	tag := strings.ToLower(goquery.NodeName(s))
	switch tag {
	case "button":
		return "button"
	case "textarea":
		return "textbox"
	case "select":
		return "combobox"
	case "input":
		switch strings.ToLower(attrDefault(s, "type", "text")) {
		case "button", "submit", "reset", "image":
			return "button"
		case "checkbox":
			return "checkbox"
		case "radio":
			return "radio"
		case "number":
			return "spinbutton"
		default:
			return "textbox"
		}
	case "a":
		if attrDefault(s, "href", "") != "" {
			return "link"
		}
	}
	return ""
}

func cssFallback(s *goquery.Selection) string {
	tag := strings.ToLower(goquery.NodeName(s))
	if tag == "" {
		return "*"
	}
	if id, ok := s.Attr("id"); ok && stableID(id) {
		return "#" + cssEscape(id)
	}
	for parent := s.Parent(); parent != nil && goquery.NodeName(parent) != ""; parent = parent.Parent() {
		if id, ok := parent.Attr("id"); ok && stableID(id) {
			return "#" + cssEscape(id) + " " + tag
		}
		if testid, ok := parent.Attr("data-testid"); ok && testid != "" {
			return `[data-testid="` + cssEscape(testid) + `"] ` + tag
		}
		if goquery.NodeName(parent) == "html" {
			break
		}
	}
	return tag
}

func crudOp(form *goquery.Selection, method string) string {
	override := strings.ToUpper(attrDefault(form.Find(`input[name="_method"]`).First(), "value", ""))
	if override == "PUT" || override == "PATCH" {
		return "update"
	}
	if override == "DELETE" {
		return "delete"
	}
	if method == "POST" {
		return "create"
	}
	return "unknown"
}

func normalizeURL(raw string, base string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	baseURL, err := url.Parse(base)
	if err != nil {
		return ""
	}
	u, err := url.Parse(raw)
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

func mustParse(raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		return &url.URL{Path: raw}
	}
	return u
}

func attrDefault(s *goquery.Selection, name string, fallback string) string {
	if value, ok := s.Attr(name); ok {
		return value
	}
	return fallback
}

func hasAttr(s *goquery.Selection, name string) bool {
	_, ok := s.Attr(name)
	return ok
}

func clean(value string) string {
	return strings.Join(strings.Fields(value), " ")
}

func nullable(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func strPtrAttr(s *goquery.Selection, name string) *string {
	if value, ok := s.Attr(name); ok {
		return &value
	}
	return nil
}

func intPtrAttr(s *goquery.Selection, name string) *int {
	if value, ok := s.Attr(name); ok {
		parsed, err := strconv.Atoi(value)
		if err == nil {
			return &parsed
		}
	}
	return nil
}

func stableID(value string) bool {
	if value == "" || strings.Contains(value, ":") {
		return false
	}
	return !regexp.MustCompile(`[0-9a-f]{8,}`).MatchString(value)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func cssEscape(value string) string {
	return strings.ReplaceAll(value, `"`, `\"`)
}
