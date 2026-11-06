
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
    getAuth,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Firebase Web App configuration
const firebaseConfig = {
    apiKey: "AIzaSyAMx2nBy1AyRS5B0ooGE9cVluwSdP8uD5E",
    authDomain: "day27-proctor-telemetry.firebaseapp.com",
    projectId: "day27-proctor-telemetry",
    storageBucket: "day27-proctor-telemetry.firebasestorage.app",
    messagingSenderId: "336101590740",
    appId: "1:336101590740:web:0cdf5bb8ac80c09adc1d41"
};

const COLLECTION_NAME = "proctor_tracking";
const MAX_TRACKED_EVENTS = 5000;

const seenDocumentIds = new Set();

const elements = {
    total: document.getElementById("total-events"),
    warning: document.getElementById("warning-events"),
    critical: document.getElementById("critical-events"),
    normal: document.getElementById("normal-events"),
    container: document.getElementById("event-container"),
    connectionDot: document.getElementById("connection-dot"),
    connectionText: document.getElementById("connection-text"),
    lastUpdated: document.getElementById("last-updated")
};

let unsubscribeFromEvents = null;

function escapeHTML(value) {
    return String(value ?? "N/A").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function getSeverity(event) {
    return String(event.severity_level || "NORMAL").toUpperCase();
}

function getAlertTypes(event) {
    const alerts = event.alerts || {};
    const types = [];

    if (alerts.gaze_deviation?.triggered) {
        types.push("Gaze Deviation");
    }

    if (alerts.acoustic_anomaly?.triggered) {
        types.push("Acoustic Anomaly");
    }

    return types.length ? types.join(", ") : "No anomaly detected";
}

function formatTimestamp(timestamp) {
    if (!timestamp) return "N/A";

    let date;

    if (typeof timestamp.toDate === "function") {
        date = timestamp.toDate();
    } else if (typeof timestamp === "object" && timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
    } else {
        date = new Date(timestamp);
    }

    return Number.isNaN(date.getTime())
        ? String(timestamp)
        : date.toLocaleString();
}

function getTimestampValue(timestamp) {
    if (!timestamp) return 0;

    if (typeof timestamp.toMillis === "function") {
        return timestamp.toMillis();
    }

    if (typeof timestamp === "object" && timestamp.seconds) {
        return timestamp.seconds * 1000;
    }

    const value = new Date(timestamp).getTime();
    return Number.isNaN(value) ? 0 : value;
}

function updateSummary(events) {
    const counts = {
        NORMAL: 0,
        WARNING: 0,
        CRITICAL: 0
    };

    events.forEach(event => {
        const severity = getSeverity(event);

        if (Object.hasOwn(counts, severity)) {
            counts[severity]++;
        }
    });

    elements.total.textContent = events.length;
    elements.warning.textContent = counts.WARNING;
    elements.critical.textContent = counts.CRITICAL;
    elements.normal.textContent = counts.NORMAL;
}

function createEventCard(event) {
    const severity = getSeverity(event);

    const severityClass = ["NORMAL", "WARNING", "CRITICAL"].includes(severity)
        ? severity.toLowerCase()
        : "normal";

    const candidateId = escapeHTML(event.candidate_id);
    const sessionId = escapeHTML(event.session_id);
    const documentId = escapeHTML(event.document_id);
    const timestamp = escapeHTML(formatTimestamp(event.timestamp));
    const alertType = escapeHTML(getAlertTypes(event));
    const latency = escapeHTML(event.latency_ms);

    return `
        <article class="event-card ${severityClass}">
            <div class="event-header">
                <h3>${alertType}</h3>
                <span class="severity ${severityClass}">
                    ${escapeHTML(severity)}
                </span>
            </div>

            <div class="event-details">
                <div class="detail">
                    <span>Candidate ID</span>
                    <strong>${candidateId}</strong>
                </div>

                <div class="detail">
                    <span>Session ID</span>
                    <strong>${sessionId}</strong>
                </div>

                <div class="detail">
                    <span>Timestamp</span>
                    <strong>${timestamp}</strong>
                </div>

                <div class="detail">
                    <span>Processing Latency</span>
                    <strong>${latency === "N/A" ? "N/A" : latency + " ms"}</strong>
                </div>

                <div class="detail">
                    <span>Firebase Document ID</span>
                    <strong class="document-id">${documentId}</strong>
                </div>
            </div>
        </article>
    `;
}

function detectNewEvents(events) {
    let newCount = 0;

    events.forEach(event => {
        const documentId = event.document_id;

        if (!documentId || seenDocumentIds.has(documentId)) {
            return;
        }

        seenDocumentIds.add(documentId);
        newCount++;
    });

    while (seenDocumentIds.size > MAX_TRACKED_EVENTS) {
        const oldestId = seenDocumentIds.values().next().value;
        seenDocumentIds.delete(oldestId);
    }

    return newCount;
}

function renderEvents(events) {
    const renderStart = performance.now();

    updateSummary(events);

    if (!events.length) {
        elements.container.innerHTML =
            '<div class="empty-state">No telemetry events found.</div>';
    } else {
        elements.container.innerHTML = events
            .map(createEventCard)
            .join("");
    }

    return performance.now() - renderStart;
}

function updateConnectionStatus(connected, message) {
    elements.connectionDot.className = connected
        ? "status-dot connected"
        : "status-dot disconnected";

    elements.connectionText.textContent = message;
}

function startFirestoreListener(db) {
    const listenerStart = performance.now();
    const telemetryCollection = collection(db, COLLECTION_NAME);

    unsubscribeFromEvents = onSnapshot(
        telemetryCollection,
        snapshot => {
            const callbackStart = performance.now();

            const events = snapshot.docs.map(documentSnapshot => ({
                ...documentSnapshot.data(),
                document_id: documentSnapshot.id
            }));

            events.sort((a, b) =>
                getTimestampValue(b.timestamp) -
                getTimestampValue(a.timestamp)
            );

            const newEventCount = detectNewEvents(events);
            const renderTime = renderEvents(events);
            const totalClientTime = performance.now() - callbackStart;

            updateConnectionStatus(true, "Firebase Connected");

            elements.lastUpdated.textContent =
                `Last updated: ${new Date().toLocaleTimeString()} | ` +
                `Render: ${renderTime.toFixed(2)} ms | ` +
                `Client processing: ${totalClientTime.toFixed(2)} ms | ` +
                `New events: ${newEventCount}`;

            console.info("Day28 Firestore Performance", {
                totalEvents: events.length,
                newEventsDetected: newEventCount,
                snapshotToRenderMs: Number(totalClientTime.toFixed(2)),
                domRenderTimeMs: Number(renderTime.toFixed(2)),
                initialListenerSetupMs: Number(
                    (performance.now() - listenerStart).toFixed(2)
                )
            });
        },
        error => {
            console.error("Firestore listener error:", error);

            updateConnectionStatus(false, "Firestore Read Error");

            elements.container.innerHTML =
                '<div class="empty-state">Unable to read telemetry. Check Firestore permissions.</div>';

            elements.lastUpdated.textContent =
                `Firestore error: ${escapeHTML(error.code || error.message)}`;
        }
    );
}

async function initializeDashboard() {
    try {
        updateConnectionStatus(false, "Connecting to Firebase...");

        if (
            !firebaseConfig.apiKey ||
            firebaseConfig.apiKey === "REPLACE_WITH_YOUR_ACTUAL_API_KEY"
        ) {
            throw new Error("Add the actual Firebase Web App API key.");
        }

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);

        const credentials = await signInAnonymously(auth);

        console.info(
            "Day28 Anonymous Firebase UID:",
            credentials.user.uid
        );

        updateConnectionStatus(
            false,
            "Authenticated - checking Firestore access..."
        );

        startFirestoreListener(db);

    } catch (error) {
        console.error("Day28 initialization error:", error);

        updateConnectionStatus(false, "Firebase Initialization Error");

        elements.container.innerHTML =
            `<div class="empty-state">${escapeHTML(error.message)}</div>`;
    }
}

window.addEventListener("beforeunload", () => {
    if (unsubscribeFromEvents) {
        unsubscribeFromEvents();
    }
});

initializeDashboard();