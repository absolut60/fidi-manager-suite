import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/test/d360-ping")({
  server: {
    handlers: {
      GET: async () => {
        const apiKey = process.env.D360_API_KEY;

        if (!apiKey || apiKey.trim() === "") {
          return Response.json(
            { ok: false, error: "D360_API_KEY mancante" },
            { status: 500 },
          );
        }

        try {
          const response = await fetch(
            "https://waba-v2.360dialog.io/v1/configs/templates",
            {
              method: "GET",
              headers: {
                "D360-API-KEY": apiKey,
                "Content-Type": "application/json",
              },
            },
          );

          const bodyText = await response.text();
          const bodyPreview = bodyText.slice(0, 500);

          return Response.json({
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            bodyPreview,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
