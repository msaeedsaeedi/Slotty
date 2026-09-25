import { ImageResponse } from "next/og";

/** App icons generated on the fly (no binary assets): /icons/192, /icons/512, /icons/maskable, /icons/badge. */
const KINDS = {
  "192": { size: 192, padding: 0 },
  "512": { size: 512, padding: 0 },
  // Maskable icons keep the glyph inside the central 80% "safe zone".
  maskable: { size: 512, padding: 0.2 },
  // Monochrome badge shown in the Android status bar.
  badge: { size: 96, padding: 0 },
} as const;

export function generateStaticParams() {
  return Object.keys(KINDS).map((kind) => ({ kind }));
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[kind]">) {
  const { kind } = await ctx.params;
  const spec = KINDS[kind as keyof typeof KINDS];
  if (!spec) return new Response("Not found", { status: 404 });
  const { size, padding } = spec;
  const badge = kind === "badge";
  const glyph = size * (1 - padding * 2) * 0.62;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: badge ? "transparent" : "#111111",
          borderRadius: padding || badge ? 0 : size * 0.22,
        }}
      >
        <div style={{ display: "flex", fontSize: glyph, fontWeight: 700, color: "#ffffff", lineHeight: 1, letterSpacing: -glyph * 0.04 }}>S</div>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800" } },
  );
}
