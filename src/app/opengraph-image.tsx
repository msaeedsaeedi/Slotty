import { ImageResponse } from "next/og";
import { INSTITUTION } from "@/lib/site";

export const alt = `Slotty: demo booking and marking for ${INSTITUTION} courses`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BOARD = "#0D0D0C";
const PANEL = "#1A1917";
const LINE = "#2A2925";
const TEXT = "#F1EEE6";
const TEXT_2 = "#B5B0A4";
const TEXT_3 = "#8D8876";
const GO = "#3DD68C";
const STOP = "#FF5C4D";

/** A split-flap cell, as on the landing page's board. */
function Cell({ ch, color = TEXT }: { ch: string; color?: string }) {
  return (
    <div style={{ display: "flex", position: "relative", width: 34, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 5, background: "linear-gradient(#2a2925 50%, #201f1c 50%)", color, fontSize: 30, fontWeight: 600 }}>
      {ch}
      <div style={{ position: "absolute", left: 0, right: 0, top: 23, height: 2, background: "rgba(0,0,0,0.75)" }} />
    </div>
  );
}

function Flap({ text, color }: { text: string; color?: string }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {text.split("").map((ch, i) => (
        <Cell key={i} ch={ch === " " ? "" : ch} color={color} />
      ))}
    </div>
  );
}

/** Link preview in the landing page's departure-board style (no binary assets). */
export default function OpengraphImage() {
  const rows = [
    { time: "10:00", room: "CS LAB 3", status: "FULL  ", color: STOP },
    { time: "10:15", room: "CS LAB 3", status: "BOOKED", color: GO },
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BOARD, padding: "60px 72px", color: TEXT }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600 }}>
          {/* Slotty's mark (components/slotty-mark.tsx) */}
          <div style={{ display: "flex", gap: 6, padding: "7px 8px", borderRadius: 9, border: "2.5px solid #5d5a52" }}>
            {[0, 1].map((i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ width: 11, height: 8, borderRadius: 2, background: TEXT }} />
                <div style={{ width: 11, height: 8, borderRadius: 2, background: TEXT }} />
              </div>
            ))}
          </div>
          Slotty
          <div style={{ display: "flex", marginLeft: "auto", fontSize: 20, color: TEXT_3, letterSpacing: 2 }}>{INSTITUTION}</div>
        </div>
        <div style={{ display: "flex", marginTop: 44, fontSize: 88, fontWeight: 700, letterSpacing: -3, lineHeight: 0.95 }}>Demo week, without the spreadsheet.</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", borderRadius: 18, border: `1px solid ${LINE}`, background: PANEL }}>
          {rows.map((r, i) => (
            <div key={r.time} style={{ display: "flex", alignItems: "center", gap: 36, padding: "18px 28px", borderTop: i ? `1px solid ${LINE}` : "none", background: r.color === GO ? "rgba(61,214,140,0.06)" : "transparent" }}>
              <Flap text={r.time} />
              <div style={{ display: "flex", fontSize: 24, color: TEXT_2, letterSpacing: 2 }}>{r.room}</div>
              <div style={{ display: "flex", marginLeft: "auto" }}>
                <Flap text={r.status} color={r.color} />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
