
from firebase_listener import FirebaseTelemetryListener
import time

def main():
    listener = FirebaseTelemetryListener()

    try:
        print("Starting Firebase telemetry listener...")
        listener.start()

        print("Waiting for Firestore snapshot...")
        time.sleep(5)

        events = listener.get_events()

        print(f"\nDocuments received: {len(events)}")

        for index, event in enumerate(events[:5], start=1):
            print(f"\nEvent {index}")
            print("Document ID:", event.get("document_id", "N/A"))
            print("Candidate ID:", event.get("candidate_id", "N/A"))
            print("Session ID:", event.get("session_id", "N/A"))
            print("Severity:", event.get("severity_level", "N/A"))

        print("\nFirebase listener test completed.")

    finally:
        listener.stop()


if __name__ == "__main__":
    main()