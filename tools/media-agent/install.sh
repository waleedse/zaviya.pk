#!/bin/sh
# Installs the Zaviya media agent on this Mac in ~/zaviya-media-agent (venv, sd.cpp CPU build, models) and registers it with launchd.
# Safe to run again: it skips whatever already exists. Needs: git, curl, python3 (any), network.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
AH="${ZAVIYA_AGENT_HOME:-$HOME/zaviya-media-agent}"
mkdir -p "$AH/models" "$AH/sd"

# 1. Python 3.11 venv (torch 2.2.2 is the last build for Intel Macs)
if [ ! -x "$AH/venv/bin/python" ]; then
  python3 -m venv "$AH/uv-bootstrap" && "$AH/uv-bootstrap/bin/pip" install -q uv
  "$AH/uv-bootstrap/bin/uv" python install 3.11
  "$AH/uv-bootstrap/bin/uv" venv --python 3.11 "$AH/venv"
fi
"$AH/uv-bootstrap/bin/uv" pip install -q --python "$AH/venv/bin/python" "torch==2.2.2" "numpy<2" onnxruntime vocos huggingface_hub \
  soundfile requests pyyaml "diffusers==0.31.0" "transformers==4.46.1" accelerate pillow cmake ninja

# 2. stable-diffusion.cpp, CPU only (the Mac's Metal path times out on Z-Image)
if [ ! -x "$AH/sd/sd-cli" ]; then
  [ -d "$AH/sd-src" ] || git clone -q --depth 1 --recursive https://github.com/leejet/stable-diffusion.cpp "$AH/sd-src"
  PATH="$AH/venv/bin:$PATH" cmake -S "$AH/sd-src" -B "$AH/sd-src/build" -G Ninja -DCMAKE_BUILD_TYPE=Release -DSD_METAL=OFF -DGGML_METAL=OFF
  PATH="$AH/venv/bin:$PATH" cmake --build "$AH/sd-src/build" -j 8
  cp "$AH/sd-src/build/bin/sd-cli" "$AH/sd/sd-cli"
fi

# 3. Z-Image Turbo files (Apache-2.0): diffusion model Q2_K (Q4_K is better but swaps on a busy 16 GB Mac), text encoder, VAE
dl() { [ -s "$AH/models/$2" ] || curl -fL -C - -o "$AH/models/$2" "$1"; }
dl https://huggingface.co/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q2_K.gguf z_image_turbo-Q2_K.gguf
dl https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf Qwen3-4B-Instruct-2507-Q4_K_M.gguf
dl https://huggingface.co/Comfy-Org/Z-Image-Turbo/resolve/main/split_files/vae/ae.safetensors ae.safetensors

cp "$HERE/agent.py" "$AH/agent.py"
[ -f "$AH/.env" ] || printf 'HUB_URL=https://zaviya.194-163-184-12.sslip.io/media\nMEDIA_AGENT_TOKEN=\nAGENT_NAME=mac\n' > "$AH/.env"

# 4. launchd: starts at login, restarts if it dies, and keeps the Mac awake while it runs
PLIST="$HOME/Library/LaunchAgents/pk.zaviya.media-agent.plist"
sed -e "s#__HOME__#$AH#g" "$HERE/pk.zaviya.media-agent.plist" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed. Set MEDIA_AGENT_TOKEN in $AH/.env, then: launchctl kickstart -k gui/$(id -u)/pk.zaviya.media-agent"
