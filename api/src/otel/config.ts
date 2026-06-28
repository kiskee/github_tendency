import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const otlpHeadersRaw = process.env.OTEL_EXPORTER_OTLP_HEADERS;

if (!otlpEndpoint) {
  console.error("OTEL_EXPORTER_OTLP_ENDPOINT not set");
}

// Parse "Authorization=Basic xxx" → { Authorization: "Basic xxx" }
const headers: Record<string, string> = {};
if (otlpHeadersRaw) {
  const match = otlpHeadersRaw.match(/^Authorization=(.+)$/);
  if (match) {
    headers["Authorization"] = match[1];
  }
}

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
    headers,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${otlpEndpoint}/v1/metrics`,
      headers,
    }),
    exportIntervalMillis: 15000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations(),
  ],
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "github-analytics-api",
    [ATTR_SERVICE_VERSION]: "1.0",
  }),
});

sdk.start();
