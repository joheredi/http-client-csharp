#!/usr/bin/env node

import { spawn, execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";

const packageRoot = execSync("npm prefix", { encoding: "utf-8" }).trim();

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

const iterationsStr = getArg("--iterations");
if (!iterationsStr) {
  console.error("Error: --iterations <number> is required");
  process.exit(1);
}

const iterations = parseInt(iterationsStr, 10);
if (isNaN(iterations) || iterations <= 0) {
  console.error("Error: --iterations must be a positive number");
  process.exit(1);
}

const model = getArg("--model");

const promptPath = resolve(packageRoot, "docs/ralph.md");
const prompt = readFileSync(promptPath, "utf-8");

function runCopilot(promptText) {
  const copilotArgs = ["--yolo", "-p", promptText];
  if (model) {
    copilotArgs.push("--model", model);
  }

  return new Promise((resolve, reject) => {
    const child = spawn("copilot", copilotArgs, {
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env,
    });

    let combined = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      combined += chunk;
      process.stdout.write(chunk); // ✅ forward live
    });

    child.stderr.on("data", (chunk) => {
      combined += chunk;
      process.stderr.write(chunk); // ✅ forward live
    });

    child.on("error", reject);

    child.on("close", (code) => {
      resolve({ code, output: combined });
    });
  });
}

for (let i = 1; i <= iterations; i++) {
  console.log(`\n=== Iteration ${i} of ${iterations} ===\n`);

  let code, output;
  try {
    ({ code, output } = await runCopilot(prompt));
  } catch (err) {
    console.error("\n❌ Failed to run copilot:", err?.message ?? err);
    output = err?.message ?? String(err);
    code = 1;
  }

  if (output.includes("<promise>COMPLETED</promise>")) {
    console.log("\n✅ PRD is complete! Exiting.");
    process.exit(0);
  }

  if (code !== 0) {
    console.log(`\n⚠️ Copilot exited with code ${code}`);
  }
}

console.log(`\n⏹ Finished all ${iterations} iterations.`);
