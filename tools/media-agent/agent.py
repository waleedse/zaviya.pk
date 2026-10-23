#!/usr/bin/env python3
"""Zaviya media agent: runs on Waleed's Mac, makes Urdu voice and pictures with local models for the video service.

It only connects OUT to the media hub (HTTPS long poll): claim a job, make the file, upload it.
  tts   -> Urdu female voice, Matcha-TTS (AhsanTalal/urdu-matcha-tts-female) + Vocos vocoder, CPU
  image -> quality "fast": SDXS-512 (seconds); quality "good": Z-Image Turbo Q4 via stable-diffusion.cpp (minutes)

Config in ~/zaviya-media-agent/.env : HUB_URL, MEDIA_AGENT_TOKEN, AGENT_NAME (optional)
Pause: create the file ~/zaviya-media-agent/PAUSE (no new jobs are claimed until it is removed).
"""
import io, json, os, re, subprocess, sys, tempfile, threading, time, traceback
from pathlib import Path

import numpy as np
import requests
import soundfile as sf

HOME = Path(os.environ.get("ZAVIYA_AGENT_HOME", Path.home() / "zaviya-media-agent"))
for line in (HOME / ".env").read_text().splitlines() if (HOME / ".env").exists() else []:
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

HUB = os.environ.get("HUB_URL", "").rstrip("/")
TOKEN = os.environ.get("MEDIA_AGENT_TOKEN", "")
NAME = os.environ.get("AGENT_NAME", "mac")
SD_CLI = Path(os.environ.get("SD_CLI", HOME / "sd" / "sd-cli"))
SD_MODELS = Path(os.environ.get("SD_MODELS", HOME / "models"))
LOG = HOME / "agent.log"


def log(*a):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + " ".join(str(x) for x in a)
    print(line, flush=True)
    try:
        with LOG.open("a") as f:
            f.write(line + "\n")
    except OSError:
        pass


# ---- voice -----------------------------------------------------------------------------------
_tts = {}
_tts_lock = threading.Lock()


def tts_model():
    with _tts_lock:
        if not _tts:
            import onnxruntime as ort
            import torch, yaml
            from huggingface_hub import hf_hub_download
            from vocos import Vocos

            torch.set_num_threads(int(os.environ.get("TTS_THREADS", "4")))
            repo = "AhsanTalal/urdu-matcha-tts-female"
            vocab = json.load(open(hf_hub_download(repo, "vocab.json"), encoding="utf-8"))
            sess = ort.InferenceSession(hf_hub_download(repo, "matcha_tts.onnx"), providers=["CPUExecutionProvider"])
            vrepo = "BSC-LT/vocos-mel-22khz"
            cfg = yaml.safe_load(open(hf_hub_download(vrepo, "config.yaml")))
            fe = cfg["feature_extractor"]["init_args"]
            for k in list(fe):
                if k not in ("sample_rate", "n_fft", "hop_length", "n_mels", "padding"):
                    fe.pop(k)
            cfgp = HOME / "vocos_patched.yaml"
            yaml.safe_dump(cfg, open(cfgp, "w"))
            vocos = Vocos.from_hparams(str(cfgp))
            vocos.load_state_dict(torch.load(hf_hub_download(vrepo, "pytorch_model.bin"), map_location="cpu"), strict=False)
            vocos.eval()
            _tts.update(vocab=vocab, sess=sess, vocos=vocos, torch=torch)
        return _tts


def synth_sentence(text, length_scale):
    m = tts_model()
    vocab, torch = m["vocab"], m["torch"]
    sp = vocab[" "]
    ids = [vocab.get(c, sp) for c in text]
    inter = [0] * (len(ids) * 2 + 1)
    for i, v in enumerate(ids):
        inter[i * 2 + 1] = v
    mel, _ = m["sess"].run(None, {
        "x": np.array([inter], dtype=np.int64),
        "x_lengths": np.array([len(inter)], dtype=np.int64),
        "scales": np.array([0.667, length_scale], dtype=np.float32),
    })
    with torch.no_grad():
        return m["vocos"].decode(torch.from_numpy(mel)).numpy().squeeze()


def split_long(s, limit=220):
    if len(s) <= limit:
        return [s]
    parts, cur = [], ""
    for piece in re.split(r"(?<=،)\s*", s):
        if cur and len(cur) + len(piece) > limit:
            parts.append(cur.strip())
            cur = ""
        cur += piece + " "
    if cur.strip():
        parts.append(cur.strip())
    return parts


def run_tts(payload):
    ls = float(payload.get("lengthScale", 0.9))
    sr = 22050
    gap = np.zeros(int(sr * 0.28), dtype=np.float32)
    out, ms = [], []
    for sentence in payload["sentences"]:
        chunks = [synth_sentence(p, ls) for p in split_long(sentence)]
        audio = np.concatenate([np.concatenate([c, gap * 0.4]) for c in chunks[:-1]] + [chunks[-1]]) if len(chunks) > 1 else chunks[0]
        audio = np.concatenate([audio, gap]).astype(np.float32)
        out.append(audio)
        ms.append(int(len(audio) / sr * 1000))
    full = np.concatenate(out)
    peak = float(np.max(np.abs(full))) or 1.0
    full = full * (0.89 / peak)  # peak at about -1 dBFS
    buf = io.BytesIO()
    sf.write(buf, full, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue(), "audio/wav", {"sampleRate": sr, "sentenceMs": ms, "totalMs": int(len(full) / sr * 1000)}


# ---- pictures --------------------------------------------------------------------------------
_sdxs = {}


def run_image_fast(p):
    import torch
    from diffusers import StableDiffusionPipeline

    if not _sdxs:
        torch.set_num_threads(int(os.environ.get("IMG_THREADS", "6")))
        _sdxs["pipe"] = StableDiffusionPipeline.from_pretrained("IDKiro/sdxs-512-dreamshaper", torch_dtype=torch.float32, safety_checker=None)
    w, h = (int(p["width"]) // 8) * 8, (int(p["height"]) // 8) * 8
    scale = min(1.0, 640 / max(w, h))  # SDXS is trained at 512; larger sizes repeat objects
    w, h = max(256, int(w * scale) // 8 * 8), max(256, int(h * scale) // 8 * 8)
    gen = torch.Generator().manual_seed(int(p.get("seed", 7)))
    img = _sdxs["pipe"](p["prompt"], num_inference_steps=1, guidance_scale=0, width=w, height=h, generator=gen).images[0]
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue(), "image/png", {"model": "sdxs-512", "width": w, "height": h}


def run_image_good(p):
    w, h = (int(p["width"]) // 16) * 16, (int(p["height"]) // 16) * 16
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "out.png"
        cmd = ["nice", "-n", "10", str(SD_CLI),
               "--diffusion-model", str(SD_MODELS / "z_image_turbo-Q4_K.gguf"),
               "--vae", str(SD_MODELS / "ae.safetensors"),
               "--llm", str(SD_MODELS / "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"),
               "-p", p["prompt"], "--cfg-scale", "1.0", "--steps", str(int(p.get("steps", 8))), "-W", str(w), "-H", str(h),
               "-t", os.environ.get("SD_THREADS", "6"), "--seed", str(int(p.get("seed", 7))), "-o", str(out)]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=25 * 60)
        if r.returncode != 0 or not out.exists():
            raise RuntimeError("sd-cli failed: " + (r.stderr or r.stdout)[-300:])
        return out.read_bytes(), "image/png", {"model": "z-image-turbo-q4", "width": w, "height": h}


def run_image(payload):
    return run_image_good(payload) if payload.get("quality") == "good" else run_image_fast(payload)


# ---- loop ------------------------------------------------------------------------------------
HEAD = {"Authorization": f"Bearer {TOKEN}"}


def worker(kinds, handler):
    sess = requests.Session()
    while True:
        if (HOME / "PAUSE").exists():
            time.sleep(15)
            continue
        try:
            r = sess.post(f"{HUB}/claim", headers=HEAD, json={"agent": NAME, "kinds": kinds, "waitSec": 20}, timeout=45)
        except requests.RequestException as e:
            log("hub unreachable:", type(e).__name__)
            time.sleep(20)
            continue
        if r.status_code == 204:
            continue
        if r.status_code != 200:
            log("claim refused", r.status_code)
            time.sleep(60)
            continue
        job = r.json()
        t0 = time.time()
        try:
            body, ctype, meta = handler(job["payload"])
            up = sess.put(f"{HUB}/result/{job['id']}", headers={**HEAD, "content-type": ctype, "x-meta": json.dumps(meta)}, data=body, timeout=120)
            log(job["kind"], job["id"][:8], "done in", round(time.time() - t0), "s,", len(body), "bytes, upload", up.status_code)
        except Exception as e:  # noqa: BLE001
            log(job["kind"], job["id"][:8], "failed:", e)
            traceback.print_exc()
            try:
                sess.post(f"{HUB}/fail/{job['id']}", headers=HEAD, json={"error": str(e)[:250]}, timeout=30)
            except requests.RequestException:
                pass


def main():
    if not HUB or not TOKEN:
        sys.exit(f"HUB_URL and MEDIA_AGENT_TOKEN must be set in {HOME / '.env'}")
    HOME.mkdir(parents=True, exist_ok=True)
    log("media agent started ->", HUB)
    threading.Thread(target=worker, args=(["tts"], run_tts), daemon=True).start()
    threading.Thread(target=worker, args=(["image"], run_image), daemon=True).start()
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    main()
