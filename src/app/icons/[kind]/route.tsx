import { ImageResponse } from "next/og";

/** App icons generated on the fly (no binary assets): /icons/192, /icons/512, /icons/maskable, /icons/badge. */
const KINDS = {
  "192": { size: 192, padding: 0 },
  "512": { size: 512, padding: 0 },
  // Maskable icons keep the mark inside the central 80% "safe zone" (its frame's corners stay
  // within the 40%-radius circle Android may crop to).
  maskable: { size: 512, padding: 0.1 },
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
  // Slotty's mark (components/slotty-mark.tsx): two split-flap cells in a board frame. Light
  // cells on the board's near-black; the badge is plain white on transparent, as Android expects.
  const box = size * (1 - padding * 2);
  const u = box / 24; // the mark's 24-unit grid
  const ink = badge ? "#ffffff" : "#f1eee6";
  const cell = (x: number, y: number) => (
    <div style={{ position: "absolute", left: x * u, top: y * u, width: 4.5 * u, height: 3.45 * u, borderRadius: 0.9 * u, background: ink }} />
  );
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: badge ? "transparent" : "#0d0d0c",
          borderRadius: padding || badge ? 0 : size * 0.22,
        }}
      >
        <div style={{ position: "relative", display: "flex", width: box, height: box }}>
          <div
            style={{
              position: "absolute",
              left: 2.75 * u,
              top: 4.75 * u,
              width: 18.5 * u,
              height: 14.5 * u,
              borderRadius: 3.25 * u,
              border: `${1.5 * u}px solid ${badge ? "rgba(255,255,255,0.6)" : "#5d5a52"}`,
            }}
          />
          {cell(6.5, 8.25)}
          {cell(6.5, 12.3)}
          {cell(13, 8.25)}
          {cell(13, 12.3)}
        </div>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800" } },
  );
}
