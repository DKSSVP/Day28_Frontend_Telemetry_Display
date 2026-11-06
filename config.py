
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")

FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")
FIREBASE_CREDENTIALS_PATH = os.getenv(
    "FIREBASE_CREDENTIALS_PATH",
    "serviceAccountKey.json"
)
FIREBASE_COLLECTION = os.getenv(
    "FIREBASE_COLLECTION",
    "proctor_tracking"
)

FLASK_HOST = os.getenv("FLASK_HOST", "127.0.0.1")
FLASK_PORT = int(os.getenv("FLASK_PORT", "5000"))

FIREBASE_CREDENTIALS_FILE = BASE_DIR / FIREBASE_CREDENTIALS_PATH


def validate_config():
    """Validate required Firebase configuration."""

    if not FIREBASE_PROJECT_ID:
        raise ValueError("FIREBASE_PROJECT_ID is missing in .env")

    if not FIREBASE_CREDENTIALS_FILE.exists():
        raise FileNotFoundError(
            f"Firebase credentials not found: {FIREBASE_CREDENTIALS_FILE}"
        )

    if not FIREBASE_COLLECTION:
        raise ValueError("FIREBASE_COLLECTION is missing in .env")

    return True