#!/usr/bin/env node

import { spawn } from "child_process";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const iterationsIndex = args.indexOf("--iterations");

if (iterationsIndex === -1 || !args[iterationsIndex + 1]) {
  console.error("Error: --iterations <number> is required");
  process.exit(1);
}

const iterations = parseInt(args[iterationsIndex + 1], 10);
if (isNaN(iterations) || iterations <= 0) {
  console.error("Error: --iterations must be a positive number");
  process.exit(1);
}

const promptPath = resolve(__dirname, "./docs/ralph.md");
const prompt = readFileSync(promptPath, "utf-8");

function runCopilot(promptText) {
  return new Promise((resolve, reject) => {
    const child = spawn("copilot", ["--yolo", "-p", promptText], {
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