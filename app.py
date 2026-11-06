
import logging
import atexit

from flask import Flask, jsonify, render_template

from firebase_listener import FirebaseTelemetryListener
from config import FLASK_HOST, FLASK_PORT

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

telemetry_listener = FirebaseTelemetryListener()
telemetry_listener.start()

atexit.register(telemetry_listener.stop)


@app.route("/")
def dashboard():
    return render_template("index.html")


@app.route("/api/events")
def get_events():
    events = telemetry_listener.get_events()

    return jsonify({
        "success": True,
        "count": len(events),
        "events": events
    })


@app.route("/api/status")
def get_status():
    return jsonify({
        "success": True,
        "firebase_listener": "connected",
        "collection": "proctor_tracking"
    })


if __name__ == "__main__":
    logger.info("Starting Day28 Telemetry Dashboard")

    app.run(
        host=FLASK_HOST,
        port=FLASK_PORT,
        debug=False,
        use_reloader=False
    )