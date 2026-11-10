import { expect, it } from "vitest";
import { validVisualRegion, type PageVisual } from "../visual-schema";

const visual: PageVisual = { frames: [{ id: "V1", image: "data:image/jpeg;base64,AA==", width: 1200, height: 1600, offsetY: 0 }], capturedAt: "2026-11-10", truncated: false, mode: "static" };
const region = { frameId: "V1", x: 100, y: 200, width: 300, height: 80 };

it("only accepts a rectangle inside an existing capture", () => {
  expect(validVisualRegion(region, visual)).toEqual(region);
  expect(validVisualRegion({ ...region, frameId: "V99" }, visual)).toBeNull();
  expect(validVisualRegion({ ...region, x: 900 }, visual)).toBeNull();
  expect(validVisualRegion({ ...region, height: 0 }, visual)).toBeNull();
  expect(validVisualRegion({ ...region, y: NaN }, visual)).toBeNull();
  expect(validVisualRegion(region, null)).toBeNull();
});
