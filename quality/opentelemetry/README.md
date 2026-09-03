# OpenTelemetry adapter contract

V3 propagates W3C `traceparent` plus `x-world-correlation-id` through the Cloud Run wrapper without adding a heavy runtime dependency. If an OTLP collector already exists, Desktop AI may add the official OpenTelemetry Node SDK and set `OTEL_EXPORTER_OTLP_ENDPOINT`; do not create a second telemetry backend when Sentry/PostHog already receive the same correlation ID.
