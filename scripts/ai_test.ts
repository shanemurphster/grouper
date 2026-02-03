#!/usr/bin/env ts-node
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
// load .env if present so OPENAI_API_KEY and USE_AI_STUB are available
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv = require("dotenv");
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
} catch (e) {
  // ignore if dotenv not installed
}
import { createClient } from "@supabase/supabase-js";
import generatePlan from "../src/ai/generatePlan";

function usage() {
  console.log("Usage:");
  console.log("  pnpm ai:test --project <projectId> [--persist]");
  console.log("  pnpm ai:test --title \"...\" --timeframe oneWeek --group 4 --file ./prompt.txt [--persist --project <projectId>]");
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out: any = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--project") out.project = args[++i];
    else if (a === "--title") out.title = args[++i];
    else if (a === "--description") out.description = args[++i];
    else if (a === "--timeframe") out.timeframe = args[++i];
    else if (a === "--group") out.group = parseInt(args[++i], 10);
    else if (a === "--file") out.file = args[++i];
    else if (a === "--persist") out.persist = true;
    else if (a === "--help") usage();
  }
  return out;
}

async function main() {
  const argv = parseArgs();
  let supabase: any = null;

  let title = argv.title;
  let description = argv.description;
  let timeframe = argv.timeframe as any;
  let group = argv.group;
  let assignment_details = "";
  let projectId = argv.project;

  if (projectId) {
    // fetch project fields
    const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env to use --project");
      process.exit(1);
    }
    // create client only when needed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from("projects").select("name,description,timeframe,assignment_details,group_size").eq("id", projectId).maybeSingle();
    if (error || !data) {
      console.error("Failed to load project", error);
      process.exit(1);
    }
    title = title ?? data.name;
    description = description ?? data.description;
    timeframe = timeframe ?? data.timeframe;
    group = group ?? data.group_size;
    assignment_details = data.assignment_details ?? "";
  } else {
    if (!title || !timeframe || !group || !argv.file) usage();
    assignment_details = fs.readFileSync(path.resolve(argv.file), "utf-8");
  }

  const aiInput = { title, description, timeframe, assignment_details, group_size: group };
  console.log("Generating plan with input summary:", { title, timeframe, group_size: group, assignment_len: (assignment_details || "").length });
  try {
    const plan = await generatePlan(aiInput);
    // write JSON file
    const outPath = path.resolve(process.cwd(), "tmp", "plan.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(plan, null, 2));
    // print summary
    console.log("Bundles:", plan.bundles.length);
    plan.bundles.forEach((b: any, i: number) => {
      const total = (b.tasks ?? []).reduce((s: number, t: any) => s + (t.effort_points ?? 0), 0);
      console.log(`  ${b.label} (${b.bundle_title}) - tasks: ${b.tasks.length}, effort: ${total}`);
      (b.tasks ?? []).forEach((t: any) => {
        console.log(`    - [${t.size}/${t.effort_points}] ${t.title}`);
      });
    });

    if (argv.persist) {
      const token = process.env.SUPABASE_TEST_USER_TOKEN;
      if (!token) {
        console.error("Set SUPABASE_TEST_USER_TOKEN in env to persist via server endpoint");
      } else {
        const url = `${SUPABASE_URL}/functions/v1/persist-plan`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ project_id: projectId }),
        });
        const jd = await res.json();
        console.log("Persist response:", jd);
      }
    }
  } catch (e: any) {
    console.error("generatePlan failed:", e?.message ?? e);
    process.exit(1);
  }
}

main();


