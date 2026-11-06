
import threading
import logging

import firebase_admin
from firebase_admin import credentials, firestore

from config import (
    FIREBASE_PROJECT_ID,
    FIREBASE_CREDENTIALS_FILE,
    FIREBASE_COLLECTION,
    validate_config,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class FirebaseTelemetryListener:
    def __init__(self):
        validate_config()

        self.db = self._initialize_firebase()
        self.collection = self.db.collection(FIREBASE_COLLECTION)

        self._lock = threading.Lock()
        self._events = []
        self._listener = None
        self._started = False

    @staticmethod
    def _initialize_firebase():
        if not firebase_admin._apps:
            credential = credentials.Certificate(
                str(FIREBASE_CREDENTIALS_FILE)
            )

            firebase_admin.initialize_app(
                credential,
                {
                    "projectId": FIREBASE_PROJECT_ID
                },
            )

        return firestore.client()

    def _on_snapshot(self, collection_snapshot, changes, read_time):
        """Receive Firestore updates and maintain recent telemetry events."""

        updated_events = []

        for document in collection_snapshot:
            event = document.to_dict() or {}

            # Include the document ID for dashboard identification.
            event["document_id"] = document.id

            updated_events.append(event)

        # Newest events first.
        updated_events.reverse()

        with self._lock:
            self._events = updated_events[:100]

        logger.info(
            "Firestore snapshot received: %s documents",
            len(updated_events),
        )

    def start(self):
        """Start the Firestore real-time snapshot listener."""

        if self._started:
            return

        self._listener = self.collection.on_snapshot(
            self._on_snapshot
        )

        self._started = True
        logger.info(
            "Firestore listener started for collection: %s",
            FIREBASE_COLLECTION,
        )

    def get_events(self):
        """Return a safe copy of recent telemetry events."""

        with self._lock:
            return list(self._events)

    def stop(self):
        """Stop the Firestore listener cleanly."""

        if self._listener is not None:
            self._listener.unsubscribe()
            self._listener = None

        self._started = False
        logger.info("Firestore listener stopped.")