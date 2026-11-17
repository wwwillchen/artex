#!/usr/bin/env bash
# Rebuild the embedded UI and Linux binary, then replace only the app container.
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"

for tool in docker go npm rsync; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$tool" >&2
    exit 1
  fi
done

docker compose version >/dev/null
docker_arch="$(docker info --format '{{.Architecture}}')"
case "$docker_arch" in
  arm64|aarch64) target_arch=arm64 ;;
  amd64|x86_64) target_arch=amd64 ;;
  *) printf 'Unsupported Docker architecture: %s\n' "$docker_arch" >&2; exit 1 ;;
esac

compose=(docker compose --project-directory "$repo_dir"
  -f "$repo_dir/docker-compose.yml"
  -f "$repo_dir/docker-compose.local.yml")

# Validate .env / Compose before spending time on a build. Do not print secrets.
"${compose[@]}" config --quiet

printf '\n[1/3] Build frontend and embedded Linux/%s binary\n' "$target_arch"
ARTEX_RELEASE=0 \
ARTEX_PACKAGE=0 \
ARTEX_SKIP_FRONTEND=0 \
ARTEX_SKIP_NPM_CI=0 \
ARTEX_OUTPUT="$repo_dir/dist/$target_arch/artex" \
npm_config_include=dev \
  bash "$repo_dir/build.sh" --target "linux/$target_arch" --no-compress

if [ ! -s "$repo_dir/dist/$target_arch/artex" ]; then
  printf 'Build did not produce dist/%s/artex; leaving the running container alone.\n' "$target_arch" >&2
  exit 1
fi

printf '\n[2/3] Build local Docker image\n'
docker build --platform "linux/$target_arch" --tag artex:local "$repo_dir"

printf '\n[3/3] Recreate ARTEX using the local image\n'
"${compose[@]}" up -d --no-deps --force-recreate --pull never artex

printf '\nARTEX recreated with the local UI build. Open http://localhost:8787 and hard-refresh.\n'
