import { ImageResponse } from "next/og";

import { standard } from "@/components/brand/paths";
import { brandColors } from "@/lib/brand";

export const alt = "WUAVY";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/*
  The cover board as a share image: Black wordmark on Signal, bleeding left,
  right and bottom with the cover's proportions. No text, so no font to load.
*/
export default function OpengraphImage() {
  const { letters } = standard;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${standard.viewBox}"><g fill="${brandColors.black}" fill-rule="evenodd">${Object.values(
    letters,
  )
    .map((d) => `<path d="${d}"/>`)
    .join("")}</g></svg>`;

  const width = Math.round(size.width * 1.052);
  const height = Math.round(width / (standard.width / standard.height));

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: brandColors.signal }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
          width={width}
          height={height}
          alt=""
          style={{ position: "absolute", left: -Math.round(size.width * 0.014), bottom: -Math.round(size.width * 0.044) }}
        />
      </div>
    ),
    size,
  );
}
