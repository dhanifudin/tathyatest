SHELL := /bin/sh

ROOT := $(CURDIR)
GENERATOR_DIR := $(ROOT)/generator
TT := node $(GENERATOR_DIR)/dist/cli/main.js

.PHONY: help install uninstall build generator-install generator-uninstall verify generator-test tt-help clean baseline-init setup configs case-study-setup serve clean-outputs

help:
	@printf '%s\n' \
		'Targets:' \
		'  make setup           install + root deps + Playwright browsers + local config (first run)' \
		'  make install         build and link tt into the active Node/bin path' \
		'  make case-study-setup STACK=blade|inertia   install, configure, migrate, build one case study' \
		'  make serve STACK=blade|inertia              serve a case study (COVERAGE=1)' \
		'  make clean-outputs   delete crawl, generated specs, reports and stored sessions' \
		'  make uninstall       remove the installed tt binary' \
		'  make verify          Run generator verification and smoke the compiled tt entrypoint' \
		'  make baseline-init   initialise git submodules (public SauceDemo baseline suites)' \
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
	cd generator && npm run typecheck && npm run lint && npm test

tt-help: install
	$(TT) --help >/dev/null
	$(TT) init --help >/dev/null
	$(TT) crawl --help >/dev/null
	$(TT) generate --help >/dev/null
	$(TT) run --help >/dev/null
	$(TT) report --help >/dev/null
	$(TT) all --help >/dev/null
	$(TT) eval --help >/dev/null

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

clean:
	rm -rf $(GENERATOR_DIR)/dist

# ---- first-run setup and case studies --------------------------------------------------------

STACK ?= blade
ifeq ($(STACK),inertia)
APP_DIR := case-study/todo-inertia-react
APP_PORT := 8001
else
APP_DIR := case-study/todo-blade
APP_PORT := 8000
endif

# Local config (gitignored): the root config carries evaluation.stacks for `tt eval --all-stacks`.
configs:
	@[ -f tathya.config.yaml ] || { cp tathya.config.example.yaml tathya.config.yaml && echo "created tathya.config.yaml"; }

setup: install configs
	npm install
	npx playwright install

# Needs nix-shell (PHP lives there). Safe to re-run: .env and the key are only created once.
case-study-setup:
	nix-shell $(APP_DIR)/shell.nix --run "cd $(APP_DIR) && composer install && { [ -f .env ] || cp .env.example .env; } && php artisan key:generate --force && touch database/database.sqlite && php artisan migrate:fresh --seed"
	cd $(APP_DIR) && npm install --no-audit --no-fund && npm run build

serve:
	nix-shell $(APP_DIR)/shell.nix --run "cd $(APP_DIR) && COVERAGE=1 php artisan serve --port=$(APP_PORT)"

clean-outputs:
	rm -rf crawl/*.json tests/generated storageState/*.json test-results playwright-report metrics metrics-saucedemo
