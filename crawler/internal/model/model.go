package model

type Locator struct {
	Strategy string `json:"strategy"`
	Value    string `json:"value"`
}

type Constraints struct {
	MinLength *int    `json:"minlength"`
	MaxLength *int    `json:"maxlength"`
	Min       *string `json:"min"`
	Max       *string `json:"max"`
	Step      *string `json:"step"`
	Pattern   *string `json:"pattern"`
	InputMode *string `json:"inputmode"`
	Accept    *string `json:"accept"`
}

type Option struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type Field struct {
	Name        string      `json:"name"`
	Type        string      `json:"type"`
	Label       *string     `json:"label"`
	Required    bool        `json:"required"`
	Constraints Constraints `json:"constraints"`
	Options     []Option    `json:"options"`
	NameHints   []string    `json:"nameHints"`
	Locator     Locator     `json:"locator"`
}

type Submit struct {
	Text    *string `json:"text"`
	Locator Locator `json:"locator"`
}

type Form struct {
	Action     string  `json:"action"`
	Method     string  `json:"method"`
	CrudOp     string  `json:"crudOp"`
	NoValidate bool    `json:"noValidate"`
	Fields     []Field `json:"fields"`
	Submit     Submit  `json:"submit"`
}

type Link struct {
	Href    string  `json:"href"`
	Text    string  `json:"text"`
	Locator Locator `json:"locator"`
}

type Button struct {
	Text    string  `json:"text"`
	Locator Locator `json:"locator"`
}

type Table struct {
	Headers  []string `json:"headers"`
	RowCount int      `json:"rowCount"`
}

type Page struct {
	URL     string   `json:"url"`
	Title   string   `json:"title"`
	Forms   []Form   `json:"forms"`
	Links   []Link   `json:"links"`
	Buttons []Button `json:"buttons"`
	Tables  []Table  `json:"tables"`
}

type CrawlOutput struct {
	BaseURL   string `json:"baseUrl"`
	Engine    string `json:"engine"`
	Role      string `json:"role"`
	CrawledAt string `json:"crawledAt"`
	Pages     []Page `json:"pages"`
}
