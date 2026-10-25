# Developer task runner. Run `make` (or `make help`) to
# list the available targets.

.DEFAULT_GOAL := help

APP_DIR ?= ../../intothefray

##@ Setup

.PHONY: install
install: ## Install dependencies from the lockfile
	pnpm install --frozen-lockfile

##@ Publish

.PHONY: publish
publish: ## Sync sources, upload new images and write the manifest
	$(MAKE) -C $(APP_DIR) sources
	node src/publish.ts $(APP_DIR)
	$(MAKE) -C $(APP_DIR) packs

.PHONY: refresh
refresh: ## Empty the download and encode caches (.cache/)
	rm -rf .cache

##@ Quality

.PHONY: test
test: ## Run the test suite
	pnpm test

.PHONY: check
check: ## Type-check and run the test suite
	pnpm check
	pnpm test

##@ Helpers

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(firstword $(MAKEFILE_LIST))
