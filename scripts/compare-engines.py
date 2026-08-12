#!/usr/bin/env python3
"""
Side-by-side accuracy & latency comparison: Azure vs SpeechSuper
on the same Korean WAV. Uses production keys via .env.local.

Usage:
    python3 scripts/compare-engines.py [WAV_PATH] [REF_TEXT]
"""
from __future__ import annotations

import json
import os
import sys
import time
import hashlib
from pathlib import Path

import requests  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env.local"


def load_env() -> dict[str, str]:
    out: dict[str, str] = {}
    if not ENV_PATH.exists():
        return out
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def speechsuper(wav_path: str, ref_text: str, env: dict[str, str]) -> dict:
    app_key = env.get("SPEECHSUPER_APP_KEY") or os.environ.get("SPEECHSUPER_APP_KEY", "")
    secret = env.get("SPEECHSUPER_SECRET_KEY") or os.environ.get("SPEECHSUPER_SECRET_KEY", "")
    base = env.get("SPEECHSUPER_BASE_URL", "https://api.speechsuper.com")
    if not app_key or not secret:
        return {"error": "SPEECHSUPER credentials missing"}

    ts = str(int(time.time()))
    connect_sig = hashlib.sha1((app_key + ts + secret).encode()).hexdigest()
    start_sig = hashlib.sha1((app_key + ts + "compare" + secret).encode()).hexdigest()
    params = {
        "connect": {
            "cmd": "connect",
            "param": {
                "sdk": {"version": 16777472, "source": 9, "protocol": 2},
                "app": {"applicationId": app_key, "sig": connect_sig, "timestamp": ts},
            },
        },
        "start": {
            "cmd": "start",
            "param": {
                "app": {"userId": "compare", "applicationId": app_key, "timestamp": ts, "sig": start_sig},
                "audio": {"audioType": "wav", "channel": 1, "sampleBytes": 2, "sampleRate": 16000},
                "request": {"coreType": "sent.eval.promax", "refText": ref_text, "tokenId": "compare"},
            },
        },
    }
    url = base.rstrip("/") + "/sent.eval.promax"
    t0 = time.perf_counter()
    with open(wav_path, "rb") as f:
        r = requests.post(
            url,
            data={"text": json.dumps(params)},
            headers={"Request-Index": "0"},
            files={"audio": f},
            timeout=60,
        )
    elapsed = time.perf_counter() - t0
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
    return {"http": r.status_code, "elapsed_s": round(elapsed, 2), "body": body}


def azure(wav_path: str, ref_text: str, env: dict[str, str]) -> dict:
    """
    Azure Speech REST endpoint (Pronunciation Assessment) — short audio mode.
    Requires AZURE_SPEECH_KEY (server-side) + AZURE_SPEECH_REGION.
    """
    key = env.get("AZURE_SPEECH_KEY") or env.get("NEXT_PUBLIC_AZURE_SPEECH_KEY") or os.environ.get("AZURE_SPEECH_KEY", "")
    region = env.get("AZURE_SPEECH_REGION") or env.get("NEXT_PUBLIC_AZURE_SPEECH_REGION") or "eastus"
    if not key:
        return {"error": "Azure speech key missing"}

    pa_config = {
        "ReferenceText": ref_text,
        "GradingSystem": "HundredMark",
        "Granularity": "Phoneme",
        "EnableMiscue": "True",
    }
    pa_b64 = __import__("base64").b64encode(json.dumps(pa_config).encode("utf-8")).decode("ascii")

    url = f"https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=ko-KR&format=detailed"
    headers = {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Pronunciation-Assessment": pa_b64,
        "Accept": "application/json",
    }
    t0 = time.perf_counter()
    with open(wav_path, "rb") as f:
        data = f.read()
    r = requests.post(url, headers=headers, data=data, timeout=60)
    elapsed = time.perf_counter() - t0
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
    return {"http": r.status_code, "elapsed_s": round(elapsed, 2), "body": body}


def summarize_speechsuper(b: dict | str) -> str:
    if not isinstance(b, dict):
        return str(b)[:200]
    if b.get("errId") and b.get("errId") != 0 and b.get("error"):
        return f"ERROR errId={b['errId']} '{b['error']}'"
    res = b.get("result") or {}
    return (
        f"acc={res.get('pronunciation', res.get('overall', '?'))} "
        f"flu={res.get('fluency', '?')} "
        f"int={res.get('integrity', '?')} "
        f"rhy={res.get('rhythm', '?')}"
    )


def summarize_azure(b: dict | str) -> str:
    if not isinstance(b, dict):
        return str(b)[:200]
    nbest = b.get("NBest") or []
    if not nbest:
        return f"RecognitionStatus={b.get('RecognitionStatus','?')}"
    pa = (nbest[0] or {}).get("PronunciationAssessment") or {}
    return (
        f"acc={pa.get('AccuracyScore', '?')} "
        f"flu={pa.get('FluencyScore', '?')} "
        f"comp={pa.get('CompletenessScore', '?')} "
        f"prosody={pa.get('ProsodyScore', '?')}"
    )


def main() -> None:
    wav = sys.argv[1] if len(sys.argv) > 1 else "/tmp/speakup-test.wav"
    ref = (
        sys.argv[2]
        if len(sys.argv) > 2
        else "간장공장 공장장은 강 공장장이고 된장공장 공장장은 공 공장장이다"
    )
    env = load_env()

    if not Path(wav).exists():
        print(f"WAV not found: {wav}", file=sys.stderr)
        sys.exit(1)

    print(f"WAV: {wav}")
    print(f"Reference: {ref}")
    print()

    print("→ SpeechSuper sent.eval.promax")
    ss = speechsuper(wav, ref, env)
    print(f"  http={ss.get('http')} elapsed={ss.get('elapsed_s')}s")
    print(f"  summary: {summarize_speechsuper(ss.get('body', {}))}")
    print()

    print("→ Azure pronunciation assessment (REST)")
    az = azure(wav, ref, env)
    print(f"  http={az.get('http')} elapsed={az.get('elapsed_s')}s")
    print(f"  summary: {summarize_azure(az.get('body', {}))}")
    print()

    out_path = Path("/tmp/compare-engines-output.json")
    out_path.write_text(json.dumps({"speechsuper": ss, "azure": az, "ref": ref, "wav": wav}, ensure_ascii=False, indent=2))
    print(f"Full bodies → {out_path}")


if __name__ == "__main__":
    main()
