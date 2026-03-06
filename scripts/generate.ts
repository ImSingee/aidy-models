#!/usr/bin/env bun

import { join } from "node:path";
import { writeGeneratedModels } from "../src/generate/index.ts";

const root = join(import.meta.dirname, "..");
const outputPath = join(root, "models.json");

await writeGeneratedModels({ outputPath });
