APP_DIR ?= ../../intothefray

.PHONY: publish refresh test check

publish:
	$(MAKE) -C $(APP_DIR) sources
	node src/publish.ts
	$(MAKE) -C $(APP_DIR) packs

refresh:
	rm -rf .cache

test:
	pnpm test

check:
	pnpm check
	pnpm test
