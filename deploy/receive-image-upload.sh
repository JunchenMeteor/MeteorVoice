#!/usr/bin/env bash
set -euo pipefail

app_name="${1:-}"
image_sha="${SSH_ORIGINAL_COMMAND:-}"

if [[ ! "${app_name}" =~ ^(meteorvoice|meteortest)$ ]]; then
  echo "Unsupported application" >&2
  exit 1
fi

if [[ ! "${image_sha}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid image SHA" >&2
  exit 1
fi

target_dir="/srv/deploy-inbox/${app_name}"
target_file="${target_dir}/${image_sha}.tar.gz"
temporary_file="${target_file}.uploading"

mkdir -p "${target_dir}"
umask 0027
ulimit -f 262144
timeout 900 tee "${temporary_file}" >/dev/null
test -s "${temporary_file}"
mv "${temporary_file}" "${target_file}"
printf 'Stored %s\n' "${target_file}"
