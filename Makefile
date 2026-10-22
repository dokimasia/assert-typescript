# Managed by ergon init, with .ergon/local/Makefile merged in. Change the repository's settings there and run ergon init sync.
#
# make check is the gate of the repository. lint-common lints the Markdown files, and lint-github
# lints the workflows. Each language adds its own fmt, lint, test, generate, audit and check
# targets as prerequisites of the targets below. CI runs make check-<language> per language. It
# runs lint-common and lint-github in jobs of their own. Every target runs its tools through ergon
# tool run, which installs the version that .ergon.yaml names. make help lists the targets in
# groups. A line ##@ <name> starts a group: the common targets, the targets of the GitHub files and
# of spec, then the targets of each language, and the targets of .ergon/local/Makefile after a line
# of its own.

.DEFAULT_GOAL := check

# The command that runs ergon for the tools of the targets. The key ergon of the section common of
# .ergon.yaml sets it.
ERGON ?= ergon

# The tools of the common targets, which ergon installs at the versions of the section common.
RUMDL := $(ERGON) tool run common.rumdl --

# verify-generated runs the command of the variable $(1) and fails when the run changes a file of
# the repository, with the target $(2) that updates the files in its message. It compares the
# changes of the working tree before and after the run, so it also runs on a tree with uncommitted
# changes.
verify-generated = before="$$(git diff HEAD --binary 2>/dev/null; git ls-files --others --exclude-standard)"; \
	$($(1)) || exit 1; \
	after="$$(git diff HEAD --binary 2>/dev/null; git ls-files --others --exclude-standard)"; \
	if [ "$$before" != "$$after" ]; then \
	echo "$(2): the generated files are out of date, so run make $(2) and commit the result:" >&2; \
	git status --short >&2; exit 1; fi

.PHONY: help fmt lint test generate audit check lint-common

##@ Common

help: ## List the targets in groups
	@awk 'BEGIN {FS = ":.*## "} /^##@ / {group = substr($$0, 5); next} /^[a-z][a-z-]*:.*## / {if (group != shown) {printf "%s%s\n", (shown == "" ? "" : "\n"), group; shown = group} printf "  %-28s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

fmt: ## Format the sources of every language
lint: ## Lint the Markdown files, the workflows and the sources of every language
test: ## Run the tests of every language
generate: ## Run the generators of every language
audit: ## Run the vulnerability scan of every language
check: ## Run the gate of every language, and lint the Markdown files and the workflows
lint: lint-common
check: lint-common

lint-common: ## Lint the Markdown files with rumdl and the rules of .markdownlint.yml
	$(RUMDL) check --no-cache .

##@ GitHub
#
# The section github of .ergon.yaml sets the tools of the GitHub targets.

# The tools of the GitHub targets, which ergon installs at the versions of the section github.
ACTIONLINT := $(ERGON) tool run github.actionlint --

.PHONY: lint-github
lint: lint-github
check: lint-github

# actionlint runs shellcheck and pyflakes on the scripts of the steps, and the flags turn both off.
# ergon pins neither program, so actionlint would run the versions that the machine has.
lint-github: ## Lint the workflows with actionlint and the configuration of .github/actionlint.yaml
	$(ACTIONLINT) -shellcheck= -pyflakes=

##@ Spec
#
# The section spec of .ergon.yaml sets the roles of the repository and the release of spec. spec
# reads its own configuration from .spec.yaml.

# The program spec, which ergon installs at the version of the section spec.
SPEC := $(ERGON) tool run spec.spec --

.PHONY: check-spec
check: check-spec

check-spec: ## Check the copies of the definitions against their manifests with spec
	$(SPEC) check

##@ JavaScript and TypeScript
#
# The section js of .ergon.yaml sets the package manager, the toolkit, the tools and the options of
# the targets that JavaScript and TypeScript share. One run overrides an option on the command line,
# such as make audit-js JS_AUDIT_SEVERITY=high.

# The tools of the shared targets, which ergon runs at the versions of the section js.
BIOME := $(ERGON) tool run js.biome --

# The command that runs the tests of JavaScript and TypeScript, before the arguments of a run.
JS_TEST := npm test --

# The options of the section js.
JS_PATHS ?= .
JS_AUDIT_SEVERITY ?= low

.PHONY: fmt-js lint-js audit-js
fmt: fmt-js
audit: audit-js

fmt-js: ## Format the JavaScript and TypeScript sources with Biome
	$(BIOME) check --write --linter-enabled=false $(JS_PATHS)
lint-js: ## Check the format and the lint of the JavaScript and TypeScript sources with biome.json
	$(BIOME) ci --error-on-warnings --skip=correctness/noNodejsModules $(JS_PATHS)
audit-js: ## Scan package-lock.json for known vulnerabilities
	npm audit --audit-level=$(JS_AUDIT_SEVERITY) --include=dev

##@ TypeScript
#
# The section typescript of .ergon.yaml sets the tools and the options of the TypeScript targets,
# and the steps of check-typescript. One run overrides an option on the command line, such as
# make test-typescript TYPESCRIPT_TEST_ARGS=test/unit.

# The tools of the TypeScript targets, which ergon runs at the versions of the section typescript.
TSC := $(ERGON) tool run typescript.typescript --

# The options of the section typescript.
TYPESCRIPT_TEST_ARGS ?=
TYPESCRIPT_GENERATE ?= npm run api-docs

.PHONY: lint-typescript test-typescript generate-typescript verify-generate-typescript audit-typescript check-typescript
lint: lint-typescript
test: test-typescript
generate: generate-typescript
check: check-typescript

lint-typescript: lint-js ## Check the TypeScript sources with Biome, and with tsc in its strictest mode
	$(TSC) --noEmit --strict --noUncheckedIndexedAccess --noImplicitOverride --noImplicitReturns \
		--noFallthroughCasesInSwitch --noPropertyAccessFromIndexSignature --exactOptionalPropertyTypes
test-typescript: ## Run the TypeScript tests
	$(JS_TEST)$(if $(TYPESCRIPT_TEST_ARGS), $(TYPESCRIPT_TEST_ARGS))
generate-typescript: ## Run the generators of TypeScript
	$(TYPESCRIPT_GENERATE)
verify-generate-typescript: ## Fail when the generators of TypeScript change a file of the repository
	@$(call verify-generated,TYPESCRIPT_GENERATE,generate-typescript)
audit-typescript: audit-js ## Scan the packages of TypeScript for known vulnerabilities
check-typescript: lint-typescript test-typescript audit-typescript ## Run the gate of TypeScript

# The targets of assert-typescript, which ergon init appends to the Makefile. build compiles the
# package into dist. test-typescript builds it first, because the spec of the README reads the
# declarations of dist. coverage runs the tests under coverage and fails below 100% of the lines,
# the functions, the branches and the statements.

##@ Repository

.PHONY: build coverage

build: ## Compile the package into dist
	npm run build

coverage: build ## Run the tests under coverage, and fail below 100%
	npm run coverage

test-typescript: build

# Windows skips the tests of permission bits and of long names, and a test that a system skips
# leaves a branch that no test takes there. check-typescript measures the coverage on Linux alone.
ifeq ($(shell uname -s),Linux)
check-typescript: coverage
endif
