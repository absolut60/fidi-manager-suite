import { createFileRoute } from "@tanstack/react-router";

const ENDPOINTS = [
  "https://waba-v2.360dialog.io/v1/configs/templates",
  "https://hub.360dialog.io/api/v2/configs/templates",
];

async function pingEndpoint(
  url: string,
  apiKey: string,
): Promise<{ url: string; ok: boolean; status: number | null; esito: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "D360-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    const bodyText = await response.text();
    return {
      url,
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      esito: bodyText.slice(0, 300),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      url,
      ok: false,
      status: null,
      esito: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const Route = createFileRoute("/api/test/d360-ping")({
  server: {
    handlers: {
      GET: async () => {
        const apiKey = process.env.D360_API_KEY;
        const keyPresente = !!apiKey && apiKey.trim() !== "";

        if (!keyPresente) {
          return Response.json(
            { keyPresente: false, risultati: [] },
            { status: 500 },
          );
        }

        const risultati: Array<{
          url: string;
          ok: boolean;
          status: number | null;
          esito: string;
        }> = [];

        for (const url of ENDPOINTS) {
          const res = await pingEndpoint(url, apiKey!);
          risultati.push(res);
        }

        return Response.json({ keyPresente: true, risultati });
      },
    },
  },
});
