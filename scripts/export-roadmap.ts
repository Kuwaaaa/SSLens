import { exportRoadmapMarkdown, readRoadmap, ROADMAP_MD } from "./roadmap-data.ts";

exportRoadmapMarkdown(readRoadmap());
console.log(`Wrote ${ROADMAP_MD}`);
