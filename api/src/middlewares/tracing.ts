import { Request, Response, NextFunction } from "express";
import { trace, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("github-analytics-api");

export const tracingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const spanName = `${req.method} ${req.route?.path || req.path}`;
  const span = tracer.startSpan(spanName);

  span.setAttribute("http.method", req.method);
  span.setAttribute("http.url", req.originalUrl);
  span.setAttribute("http.route", req.route?.path || req.path);

  // Adjuntar span al request para que routes/services lo accedan
  (req as any).span = span;

  const onFinish = () => {
    span.setAttribute("http.status_code", res.statusCode);

    if (res.statusCode >= 400) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${res.statusCode}` });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    span.end();
  };

  res.on("finish", onFinish);

  next();
};