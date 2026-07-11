#!/usr/bin/env bash
set -euo pipefail

required=(APP_NAME ENVIRONMENT IMAGE_URI HOST_PORT SHADOW_PORT RUNTIME_ENV_FILE PM2_NAME PUBLIC_URL)
for name in "${required[@]}"; do
  if [ -z "${!name:-}" ]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy_dir="/srv/containers/${APP_NAME}/${ENVIRONMENT}"
compose_file="${deploy_dir}/docker-compose.yml"
deployment_env="${deploy_dir}/deployment.env"
project_name="${APP_NAME}-${ENVIRONMENT}"

mkdir -p "${deploy_dir}"
install -m 0644 "${script_dir}/docker-compose.yml" "${compose_file}"

write_deployment_env() {
  local file="$1"
  local image="$2"
  local port="$3"
  {
    printf 'IMAGE_URI=%s\n' "${image}"
    printf 'HOST_PORT=%s\n' "${port}"
    printf 'RUNTIME_ENV_FILE=%s\n' "${RUNTIME_ENV_FILE}"
  } > "${file}"
  chmod 0600 "${file}"
}

compose() {
  local project="$1"
  local env_file="$2"
  shift 2
  env -u IMAGE_URI -u HOST_PORT -u RUNTIME_ENV_FILE \
    docker compose --project-name "${project}" --env-file "${env_file}" --file "${compose_file}" "$@"
}

wait_for_health() {
  local port="$1"
  local public_url="${2:-}"
  local attempt
  for attempt in $(seq 1 24); do
    if curl -fsS --max-time 5 "http://127.0.0.1:${port}/api/health" >/dev/null; then
      if [ -z "${public_url}" ] || curl -fsS --max-time 10 "${public_url}" >/dev/null; then
        return 0
      fi
    fi
    sleep 5
  done
  return 1
}

current_container="$(compose "${project_name}" "${deployment_env}" ps -q web 2>/dev/null || true)"
previous_image=""
if [ -n "${current_container}" ]; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "${current_container}")"
fi

if ! docker image inspect "${IMAGE_URI}" >/dev/null 2>&1; then
  echo "Image is not loaded: ${IMAGE_URI}" >&2
  exit 1
fi

if [ -z "${current_container}" ] && pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
  shadow_env="$(mktemp)"
  shadow_project="${project_name}-shadow"
  write_deployment_env "${shadow_env}" "${IMAGE_URI}" "${SHADOW_PORT}"
  trap 'compose "${shadow_project}" "${shadow_env}" down --remove-orphans >/dev/null 2>&1 || true; rm -f "${shadow_env}"' EXIT

  compose "${shadow_project}" "${shadow_env}" up -d --wait --wait-timeout 180
  wait_for_health "${SHADOW_PORT}"

  pm2 stop "${PM2_NAME}"
  write_deployment_env "${deployment_env}" "${IMAGE_URI}" "${HOST_PORT}"
  if ! compose "${project_name}" "${deployment_env}" up -d --wait --wait-timeout 180 \
    || ! wait_for_health "${HOST_PORT}" "${PUBLIC_URL}"; then
    compose "${project_name}" "${deployment_env}" down --remove-orphans || true
    pm2 restart "${PM2_NAME}" --update-env
    wait_for_health "${HOST_PORT}" "${PUBLIC_URL}"
    exit 1
  fi

  compose "${shadow_project}" "${shadow_env}" down --remove-orphans
  rm -f "${shadow_env}"
  trap - EXIT
  pm2 save
else
  write_deployment_env "${deployment_env}" "${IMAGE_URI}" "${HOST_PORT}"
  if ! compose "${project_name}" "${deployment_env}" up -d --wait --wait-timeout 180 \
    || ! wait_for_health "${HOST_PORT}" "${PUBLIC_URL}"; then
    if [ -n "${previous_image}" ]; then
      echo "Deployment failed; restoring ${previous_image}" >&2
      write_deployment_env "${deployment_env}" "${previous_image}" "${HOST_PORT}"
      compose "${project_name}" "${deployment_env}" up -d --wait --wait-timeout 180
      wait_for_health "${HOST_PORT}" "${PUBLIC_URL}"
    fi
    exit 1
  fi
fi

printf '%s\n' "${IMAGE_URI}" > "${deploy_dir}/current-image"
printf 'Deployed %s to %s (%s)\n' "${IMAGE_URI}" "${project_name}" "${PUBLIC_URL}"
