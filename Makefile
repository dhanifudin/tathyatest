SHELL := /bin/sh

ROOT := $(CURDIR)
GENERATOR_DIR := $(ROOT)/generator
CRAWLER_DIR := $(ROOT)/crawler
GOBIN ?= $(HOME)/go/bin
TT := node $(GENERATOR_DIR)/dist/cli.js
TT_CRAWLER_BIN := $(GOBIN)/crawler
TT_CRAWLER_LINK := $(GOBIN)/tt-crawler

.PHONY: help install uninstall build generator-install crawler-install generator-uninstall crawler-uninstall verify generator-test crawler-test tt-help clean

help:
	@printf '%s\n' \
		'Targets:' \
		'  make install        install crawler and link tt into the active Node/bin path' \
		'  make uninstall      remove the installed tt / tt-crawler binaries' \
		'  make verify         Run generator/go verification and smoke the compiled tt entrypoint' \
		'  make clean          Remove compiled artifacts'

install: crawler-install generator-install

uninstall: generator-uninstall crawler-uninstall

build: install

crawler-install:
	cd crawler && GOBIN=$(GOBIN) go install .
	mkdir -p $(GOBIN)
	ln -sf crawler $(TT_CRAWLER_LINK)

crawler-uninstall:
	rm -f $(TT_CRAWLER_LINK) $(TT_CRAWLER_BIN)

generator-install:
	cd generator && npm install && npm run build
	@if command -v asdf >/dev/null 2>&1; then \
		ASDF_NODE_DIR="$$(asdf where nodejs)"; \
		mkdir -p "$$ASDF_NODE_DIR/bin"; \
		ln -sf "$(GENERATOR_DIR)/bin/tt" "$$ASDF_NODE_DIR/bin/tt"; \
	else \
		cd generator && npm link; \
	fi

generator-uninstall:
	@if command -v asdf >/dev/null 2>&1; then \
		ASDF_NODE_DIR="$$(asdf where nodejs)"; \
		rm -f "$$ASDF_NODE_DIR/bin/tt"; \
	else \
		cd generator && npm unlink -g; \
	fi

generator-test:
	cd generator && npm run typecheck && npm test

crawler-test:
	cd crawler && go test ./...

tt-help: install
	$(TT) --help >/dev/null
	$(TT) init --help >/dev/null
	$(TT) crawl --help >/dev/null
	$(TT) generate --help >/dev/null
	$(TT) run --help >/dev/null
	$(TT) all --help >/dev/null

verify: install generator-test crawler-test tt-help

clean:
	rm -rf $(GENERATOR_DIR)/dist $(TT_CRAWLER_LINK) $(TT_CRAWLER_BIN)
