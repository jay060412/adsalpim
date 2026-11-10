import { z } from "zod";

/** Coordinates are normalized to each individual screenshot (0–1000). */
export const VisualRegionSchema = z.object({
  frameId: z.string().max(20),
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(1000),
  width: z.number().positive().max(1000),
  height: z.number().positive().max(1000),
});
export type VisualRegion = z.infer<typeof VisualRegionSchema>;

export const ScreenshotFrameSchema = z.object({
  id: z.string(),
  image: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/).max(1_500_000),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  offsetY: z.number().nonnegative(),
});
export const PageVisualSchema = z.object({
  frames: z.array(ScreenshotFrameSchema).min(1).max(8),
  capturedAt: z.string(),
  truncated: z.boolean(),
  mode: z.literal("static"),
});
export type PageVisual = z.infer<typeof PageVisualSchema>;

/** Never draw hallucinated frame IDs or rectangles beyond an actual screenshot. */
export function validVisualRegion(region: VisualRegion | null | undefined, visual: PageVisual | null): VisualRegion | null {
  if (!region || !visual?.frames.some((frame) => frame.id === region.frameId)) return null;
  const parsed = VisualRegionSchema.safeParse(region);
  if (!parsed.success || region.x + region.width > 1000 || region.y + region.height > 1000) return null;
  return parsed.data;
}
