#!/usr/bin/env bash
set -euo pipefail

COMPOSE_PROJECT="${COMPOSE_PROJECT:-autocvapply}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yaml}"
ENV_FILE="${ENV_FILE:-.env}"

compose() {
    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

echo "Logging in to GHCR..."
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_ACTOR" --password-stdin

echo "Pulling app image..."
compose pull app

echo "Replacing app container..."
compose up -d app

echo "Running migrations..."
compose exec -T app php artisan migrate --force

docker image prune -af
docker builder prune -af

echo "Deploy complete."
