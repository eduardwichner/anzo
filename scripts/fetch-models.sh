#!/usr/bin/env bash
# Recreates the authoring-time speech tooling. Idempotent: a second run downloads nothing.
#   1. Python venv tools/piper-venv with the pinned tools/requirements.txt (created if missing)
#   2. the Piper voice of each language in content/voices.json (one per language) into models/piper/,
#      with its MODEL_CARD, fetched only if a file is missing; voices no longer named there are removed
#   3. the Vosk recognizers of tools/vosk-models.json (npm run audio:check) in tools/vosk-venv + models/vosk/
#   4. models/manifest.json (sizes, sha256, licence as stated in each MODEL_CARD / the Vosk model list)
# The running app never calls this, and never loads models: audio is pre-rendered (npm run audio:render).
# Run as the developer account (it owns the code; ANZO_DEV_USER), not as root and not as the service user.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${ROOT}/tools/piper-venv"
PIPER_DIR="${ROOT}/models/piper"
HF="https://huggingface.co/rhasspy/piper-voices/resolve/main"
cd "${ROOT}"

did_something=0

if [[ ! -x "${VENV}/bin/python" ]]; then
  echo "==> creating ${VENV}"
  python3 -m venv "${VENV}"
  "${VENV}/bin/pip" install --quiet --upgrade pip
  "${VENV}/bin/pip" install --quiet -r tools/requirements.txt
  did_something=1
elif ! "${VENV}/bin/python" -c "import piper, onnx" 2>/dev/null; then  # onnx: phoneme alignments for the carrier cut
  echo "==> installing tools/requirements.txt into ${VENV}"
  "${VENV}/bin/pip" install --quiet -r tools/requirements.txt
  did_something=1
fi

mkdir -p "${PIPER_DIR}"
mapfile -t VOICES < <(node -e '
  const v = require(process.argv[1]);
  const names = new Set(Object.values(v).flatMap((t) => [t.voice, t.dialogue?.voice].filter(Boolean)));
  console.log([...names].sort().join("\n"));
' "${ROOT}/content/voices.json")

for voice in "${VOICES[@]}"; do
  # en_GB-cori-medium -> en/en_GB/cori/medium
  lang_code="${voice%%-*}"; family="${lang_code%%_*}"; rest="${voice#*-}"; name="${rest%-*}"; quality="${rest##*-}"
  if [[ -s "${PIPER_DIR}/${voice}.onnx" && -s "${PIPER_DIR}/${voice}.onnx.json" ]]; then
    :
  else
    echo "==> downloading voice ${voice}"
    "${VENV}/bin/python" -m piper.download_voices "${voice}" --data-dir "${PIPER_DIR}"
    did_something=1
  fi
  if [[ ! -s "${PIPER_DIR}/${voice}.MODEL_CARD" ]]; then
    echo "==> downloading MODEL_CARD for ${voice}"
    if ! curl -sfL "${HF}/${family}/${lang_code}/${name}/${quality}/MODEL_CARD?download=true" -o "${PIPER_DIR}/${voice}.MODEL_CARD.tmp"; then
      echo "NO MODEL_CARD PUBLISHED" > "${PIPER_DIR}/${voice}.MODEL_CARD.tmp"
    fi
    mv "${PIPER_DIR}/${voice}.MODEL_CARD.tmp" "${PIPER_DIR}/${voice}.MODEL_CARD"
    did_something=1
  fi
done

# Voices that content/voices.json no longer names (e.g. after switching voice) are deleted.
for f in "${PIPER_DIR}"/*.onnx; do
  [[ -e "${f}" ]] || continue
  voice="$(basename "${f}" .onnx)"
  if [[ ! " ${VOICES[*]} " == *" ${voice} "* ]]; then
    echo "==> removing voice ${voice} (not in content/voices.json)"
    rm -f "${PIPER_DIR}/${voice}.onnx" "${PIPER_DIR}/${voice}.onnx.json" "${PIPER_DIR}/${voice}.MODEL_CARD"
    did_something=1
  fi
done

# Vosk (offline speech recognition for npm run audio:check): its own venv, so the Piper venv stays as pinned.
VOSK_VENV="${ROOT}/tools/vosk-venv"
VOSK_DIR="${ROOT}/models/vosk"
if [[ ! -x "${VOSK_VENV}/bin/python" ]] || ! "${VOSK_VENV}/bin/python" -c "import vosk" 2>/dev/null; then
  echo "==> creating ${VOSK_VENV}"
  python3 -m venv "${VOSK_VENV}"
  "${VOSK_VENV}/bin/pip" install --quiet --upgrade pip
  "${VOSK_VENV}/bin/pip" install --quiet -r tools/requirements-vosk.txt
  did_something=1
fi
mkdir -p "${VOSK_DIR}"
mapfile -t VOSK_MODELS < <(node -e '
  const m = require(process.argv[1]).models;
  for (const v of Object.values(m)) console.log(`${v.name} ${v.sha256 ?? "-"} ${v.url}`);
' "${ROOT}/tools/vosk-models.json")
for line in "${VOSK_MODELS[@]}"; do
  read -r name want url <<< "${line}"
  if [[ ! -s "${VOSK_DIR}/${name}/am/final.mdl" ]]; then
    echo "==> downloading recognizer ${name}"
    tmp="$(mktemp -d -t anzo-fetch-XXXXXXXX)"   # a name the weekly cleanup knows
    curl -sfL "${url}" -o "${tmp}/m.zip"
    got="$(sha256sum "${tmp}/m.zip" | cut -d' ' -f1)"
    # pinned in tools/vosk-models.json: a swapped archive is never unpacked
    if [[ "${want}" != "-" && "${got}" != "${want}" ]]; then
      echo "!! ${name}: sha256 ${got} is not the pinned ${want}; not unpacked" >&2
      rm -rf "${tmp}"
      exit 1
    fi
    echo "${got}" > "${VOSK_DIR}/${name}.zip.sha256"
    unzip -q "${tmp}/m.zip" -d "${VOSK_DIR}"
    rm -rf "${tmp}"
    did_something=1
  fi
done
for d in "${VOSK_DIR}"/*/; do
  [[ -d "${d}" ]] || continue
  name="$(basename "${d}")"
  if [[ ! " ${VOSK_MODELS[*]} " == *"${name} "* ]]; then
    echo "==> removing recognizer ${name} (not in tools/vosk-models.json)"
    rm -rf "${VOSK_DIR:?}/${name}" "${VOSK_DIR}/${name}.zip.sha256"
    did_something=1
  fi
done

manifest_msg="$(node scripts/models-manifest.js)"
echo "${manifest_msg}"
[[ "${manifest_msg}" == *unchanged* ]] || did_something=1

if [[ ${did_something} -eq 0 ]]; then
  echo "fetch-models: nothing to do (venv, ${#VOICES[@]} voices and manifest are up to date)"
else
  echo "fetch-models: done (${#VOICES[@]} voices in models/piper)"
fi
