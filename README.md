# EdgeOne Content Negotiator (Backend / Edge Functions)

Welcome to the backend of the **Tri-State Content Negotiator**, built exclusively for **Tencent EdgeOne Makers**.

This repository contains a Serverless Edge Function that dynamically generates SVGs on-the-fly and routes traffic based on cryptographic validation, bot classification, and EdgeOne analytics (KV Storage).

## Features

1.  **Tri-State Routing:**
    *   🟢 **State 1 (Citizen):** Authenticated users (via HMAC-SHA256 signature validation). Gets the clean, high-resolution SVG.
    *   🟡 **State 2 (Merchant):** Verified search bots and AI crawlers (via `simulate=crawler` demo param or User-Agent). Gets a semantic SVG with embedded JSON-LD for Generative Engine Optimization (GEO).
    *   🏴 **State 3 (Bandit):** Unauthenticated scrapers. Gets a degraded, watermarked SVG with copyright warnings (Default fallback route).
2.  **KV Storage Analytics:**
    *   Records statistics for each state directly into EdgeOne KV Storage.
    *   Built to bypass the lack of `context.waitUntil` by explicitly awaiting KV writes before returning the response.
3.  **On-the-fly SVG Generation:**
    *   No origin servers. No static images. Everything is generated directly at the CDN edge for sub-millisecond response times.

## Architecture

This function is deployed to the `edge-functions` directory to comply with EdgeOne Makers routing format.
The entry point is `edge-functions/[[default]].js`, which intercepts all requests to the worker domain.

## Setup & Deployment on EdgeOne Makers

1.  **Create the Project:** Connect this repository to a new EdgeOne Makers project.
2.  **Environment Variables:**
    *   Go to Project Settings -> Environment Variables.
    *   Add `HMAC_SECRET_KEY` and set it to a secure string of your choice.
3.  **KV Storage Binding:**
    *   Create a KV Namespace in the EdgeOne Storage tab.
    *   Go to Project Settings -> Bindings / Environment Variables.
    *   Create a KV Binding with the exact Variable Name: `NEGOTIATOR_KV`.
    *   Link it to the namespace you just created.
4.  **Deploy:** Trigger a new deployment so the bindings are injected.

## Endpoints

*   `GET /api/og` - The main image generator (Requires `?title=` and `&signature=`).
*   `GET /api/og/demo-auth` - Generates a valid HMAC signature for demo testing.
*   `GET /api/og/demo?simulate=crawler` - Generates a semantic image for simulated bots.
*   `GET /api/og/stats` - Returns a JSON payload of the live KV Analytics.

## License

Built for Tencent EdgeOne.
