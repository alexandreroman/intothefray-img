# Developer task runner. Run `make` (or `make help`) to
# list the available targets.

.DEFAULT_GOAL := help

APP_DIR ?= ../../intothefray

# LANG is also the shell's locale variable, so it selects a language only
# when given on the make command line.
PACK_ARGS = $(if $(PACK),--pack $(PACK)) \
	$(if $(filter command line,$(origin LANG)),--lang $(LANG))

##@ Setup

.PHONY: install
install: ## Install dependencies from the lockfile
	pnpm install --frozen-lockfile

##@ Publish

.PHONY: download
download: ## Download missing packs; PACK=060 forces one pack, LANG=en|fr one language
	node src/publish.ts --download $(PACK_ARGS)

.PHONY: publish
publish: ## Sync sources, upload new images, write the manifest (DRY_RUN=1: no upload)
	$(MAKE) -C $(APP_DIR) sources
	node src/publish.ts --app-dir $(APP_DIR) $(if $(DRY_RUN),--dry-run)
	$(if $(DRY_RUN),,$(MAKE) -C $(APP_DIR) packs)

##@ Caches

.PHONY: refresh
refresh: ## Empty .cache/, or one cache with CACHE=o8c|http|avif
	@case "$(CACHE)" in \
	  "") rm -rf .cache ;; \
	  o8c|http|avif) rm -rf .cache/$(CACHE) ;; \
	  *) echo "CACHE must be o8c, http or avif, got \"$(CACHE)\"" >&2; exit 1 ;; \
	esac

.PHONY: verify-cdn
verify-cdn: ## Check the CDN caches KEY (default: a key of the app manifest)
	scripts/verify-cdn.sh "$(KEY)" "$(APP_DIR)/packs/images/manifest.json"

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
