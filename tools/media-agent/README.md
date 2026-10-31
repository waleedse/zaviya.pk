# Zaviya media agent (runs on the Mac)

Makes the Urdu voice and the pictures for the explainer and news videos with local models, so nothing costs per use.
It connects OUT to the media hub on the server; nothing on the Mac is exposed.

- Install: `tools/media-agent/install.sh` (about 7 GB of models, 15 minutes; builds stable-diffusion.cpp for CPU).
- Put the token in `~/zaviya-media-agent/.env` (`MEDIA_AGENT_TOKEN`), then `launchctl kickstart -k gui/$(id -u)/pk.zaviya.media-agent`.
- Pause (you need the CPU): `touch ~/zaviya-media-agent/PAUSE`; resume: remove the file.
- Log: `~/zaviya-media-agent/agent.log`.
- The Mac must be on and awake (the agent runs under `caffeinate -i`; a closed lid still sleeps it). If it is off, the server falls back
  (server-side voice, a paid image API) or skips that video; nothing waits forever.
- Voice: `AhsanTalal/urdu-matcha-tts` (male; set `TTS_REPO=AhsanTalal/urdu-matcha-tts-female` for the old female voice), length scale 0.9. Pictures: SDXS-512 (fast) and Z-Image Turbo Q4 (good, about 5 minutes for 512x512).
