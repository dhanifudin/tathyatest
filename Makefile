SHELL := /bin/sh

ROOT := $(CURDIR)
GENERATOR_DIR := $(ROOT)/generator
TT := node $(GENERATOR_DIR)/dist/cli.js

.PHONY: help install uninstall build generator-install generator-uninstall verify generator-test tt-help clean baseline-init paper paper-numbers

help:
	@printf '%s\n' \
		'Targets:' \
		'  make install         build and link tt into the active Node/bin path' \
		'  make uninstall       remove the installed tt binary' \
		'  make verify          Run generator verification and smoke the compiled tt entrypoint' \
		'  make baseline-init   initialise git submodules (public SauceDemo baseline suites)' \
		'  make paper           build docs/tathyatest-ieee.pdf with latexmk' \
		'  make paper-numbers   refresh docs/eval-numbers.tex from the tt eval reports, then build' \
		'  make clean           Remove compiled artifacts'

install: generator-install

uninstall: generator-uninstall

build: install

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

tt-help: install
	$(TT) --help >/dev/null
	$(TT) init --help >/dev/null
	$(TT) crawl --help >/dev/null
	$(TT) generate --help >/dev/null
	$(TT) run --help >/dev/null
	$(TT) all --help >/dev/null

verify: install generator-test tt-help

baseline-init:
	git submodule update --init --recursive
	@# Install each public suite's deps, then strip its nested playwright copies: two
	@# @playwright/test installations in one run break test discovery ("Requiring
	@# @playwright/test second time"); specs must resolve the repo-root copy.
	@for d in tests/baseline-public/saucedemo/*/; do \
		if [ -f "$$d/package.json" ]; then \
			(cd "$$d" && npm install --no-audit --no-fund); \
			rm -rf "$$d/node_modules/@playwright" "$$d/node_modules/playwright"; \
		fi; \
	done

# Evaluation numbers are injected via docs/eval-numbers.tex; paper-numbers
# regenerates that file from metrics/report.json + metrics-saucedemo/report.json
# (both written by `tt eval`) before compiling.
paper:
	cd docs && latexmk -pdf -interaction=nonstopmode tathyatest-ieee.tex

paper-numbers:
	node generator/scripts/report-to-tex.mjs > docs/eval-numbers.tex
	$(MAKE) paper

clean:
	rm -rf $(GENERATOR_DIR)/dist
	cd docs && latexmk -C tathyatest-ieee.tex 2>/dev/null || true
