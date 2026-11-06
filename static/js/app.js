
const API_EVENTS = "/api/events";
const API_STATUS = "/api/status";

const POLL_INTERVAL = 1000;
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

let refreshInProgress = false;

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

    if (typeof timestamp === "object" && timestamp.seconds) {
        timestamp = timestamp.seconds * 1000;
    }

    const date = new Date(timestamp);

    return Number.isNaN(date.getTime())
        ? String(timestamp)
        : date.toLocaleString();
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

    // Keep memory usage bounded.
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

async function checkConnection() {
    try {
        const response = await fetch(API_STATUS, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Status request failed");
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error("Firebase unavailable");
        }

        elements.connectionDot.className = "status-dot connected";
        elements.connectionText.textContent = "Firebase Connected";

    } catch (error) {
        elements.connectionDot.className = "status-dot disconnected";
        elements.connectionText.textContent = "Connection Error";

        console.error("Firebase connection error:", error);
    }
}

async function loadEvents() {
    const cycleStart = performance.now();

    try {
        const apiStart = performance.now();

        const response = await fetch(API_EVENTS, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Event request failed");
        }

        const data = await response.json();

        const apiResponseTime = performance.now() - apiStart;

        if (!data.success) {
            throw new Error("Unable to load events");
        }

        const events = data.events || [];

        const newEventCount = detectNewEvents(events);

        const renderTime = renderEvents(events);

        const totalClientTime = performance.now() - cycleStart;

        const meetsClientTarget = totalClientTime <= 1500;

        elements.lastUpdated.textContent =
            `Last updated: ${new Date().toLocaleTimeString()} | ` +
            `API: ${apiResponseTime.toFixed(2)} ms | ` +
            `Render: ${renderTime.toFixed(2)} ms | ` +
            `Client cycle: ${totalClientTime.toFixed(2)} ms | ` +
            `New events: ${newEventCount}`;

        console.info("Day28 Frontend Performance", {
            totalEvents: events.length,
            newEventsDetected: newEventCount,
            apiResponseTimeMs: Number(apiResponseTime.toFixed(2)),
            domRenderTimeMs: Number(renderTime.toFixed(2)),
            totalClientCycleMs: Number(totalClientTime.toFixed(2)),
            clientCycleWithin1500Ms: meetsClientTarget
        });

    } catch (error) {
        elements.container.innerHTML =
            '<div class="empty-state">Unable to load telemetry events. Retrying...</div>';

        console.error("Telemetry loading error:", error);
    }
}

async function refreshDashboard() {
    if (refreshInProgress) {
        return;
    }

    refreshInProgress = true;

    try {
        await Promise.all([
            checkConnection(),
            loadEvents()
        ]);
    } finally {
        refreshInProgress = false;
    }
}

refreshDashboard();
setInterval(refreshDashboard, POLL_INTERVAL);