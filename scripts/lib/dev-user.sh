# Sourced by the install and ops scripts. The developer account: it owns /opt/anzo and runs the content job and the disk
# check. ANZO_DEV_USER from the environment, else from the given .env file, else "anzo-dev".
anzo_dev_user() {
  local env_file="${1:-}" value=""
  if [[ -n "${ANZO_DEV_USER:-}" ]]; then echo "${ANZO_DEV_USER}"; return; fi
  if [[ -n "${env_file}" && -r "${env_file}" ]]; then
    value="$(sed -n 's/^ANZO_DEV_USER=//p' "${env_file}" | tail -n 1 | tr -d "\"' \r")"
  fi
  echo "${value:-anzo-dev}"
}
