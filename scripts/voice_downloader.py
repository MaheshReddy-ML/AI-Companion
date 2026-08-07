from pathlib import Path
import argparse
import logging
import json

try:
    from huggingface_hub import hf_hub_download
except Exception:
    hf_hub_download = None

BASE = Path(__file__).resolve().parent.parent

MODELS_DIR = BASE / "models" / "voices"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

VOICE_METADATA = MODELS_DIR / "voices.json"

RECOMMENDED = [
    {
        "repo_id": "rhasspy/piper-voices",
        "name": "lessac-female",
        "gender": "female",
        "voice": "Lessac",
        "engine": "piper",
        "description": "Warm natural female voice",

        "files": [
            "en/en_US/lessac/medium/en_US-lessac-medium.onnx",
            "en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
        ]
    },

    {
        "repo_id": "rhasspy/piper-voices",
        "name": "ryan-male",
        "gender": "male",
        "voice": "Ryan",
        "engine": "piper",
        "description": "Calm conversational male voice",

        "files": [
            "en/en_US/ryan/medium/en_US-ryan-medium.onnx",
            "en/en_US/ryan/medium/en_US-ryan-medium.onnx.json"
        ]
    }
]


def save_metadata(data):
    with open(VOICE_METADATA, "w") as f:
        json.dump(data, f, indent=4)


def load_metadata():
    if VOICE_METADATA.exists():
        with open(VOICE_METADATA) as f:
            return json.load(f)

    return []


def download_files(repo_id, files, local_dir):

    if hf_hub_download is None:
        logging.error("huggingface_hub not installed")
        return False

    try:

        local_dir.mkdir(parents=True, exist_ok=True)

        for file in files:

            print(f"Downloading: {file}")

            hf_hub_download(
                repo_id=repo_id,
                filename=file,
                local_dir=str(local_dir)
            )

        return True

    except Exception as e:
        logging.exception(f"Download failed: {e}")
        return False


def main(download=False):

    print(f"\nVoice models directory: {MODELS_DIR}")

    metadata = load_metadata()

    for model in RECOMMENDED:

        folder = MODELS_DIR / model["name"]

        if folder.exists():
            print(f"\nAlready exists: {model['name']}")
            continue

        print(f"\nPreparing: {model['name']}")

        if download:

            success = download_files(
                repo_id=model["repo_id"],
                files=model["files"],
                local_dir=folder
            )

            if success:

                print("Download complete")

                metadata.append({
                    "name": model["name"],
                    "gender": model["gender"],
                    "voice": model["voice"],
                    "engine": model["engine"],
                    "path": str(folder),
                    "description": model["description"]
                })

            else:
                print("Download failed")

    save_metadata(metadata)


if __name__ == "__main__":

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--download",
        action="store_true",
        help="Download recommended voices"
    )

    args = parser.parse_args()

    main(args.download)