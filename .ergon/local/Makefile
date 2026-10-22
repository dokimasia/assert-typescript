# Copyright Dokimasia B.V. 2026
# SPDX-License-Identifier: MIT

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
