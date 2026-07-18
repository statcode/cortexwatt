# CortexWatt — local dev (MAMP MySQL on :8889, brew Redis on :6379)
SHELL := /bin/zsh
API_DIR := apps/api

.PHONY: dev api web deps migrate seed test client

deps:
	pnpm install
	cd $(API_DIR) && uv sync

migrate:
	cd $(API_DIR) && uv run alembic upgrade head

seed:
	cd $(API_DIR) && uv run python -m app.seed

# Run API and web together (two processes)
dev: migrate seed
	( cd $(API_DIR) && uv run uvicorn app.main:app --reload --port 8000 ) & \
	pnpm --filter web dev

api:
	cd $(API_DIR) && uv run uvicorn app.main:app --reload --port 8000

web:
	pnpm --filter web dev

test:
	cd $(API_DIR) && uv run pytest -q
	pnpm --filter @cortexwatt/core test

client:
	curl -s http://localhost:8000/openapi.json -o apps/web/src/lib/openapi.json
	pnpm --filter web exec openapi-typescript src/lib/openapi.json -o src/lib/api-types.ts
