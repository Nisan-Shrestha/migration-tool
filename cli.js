#!/usr/bin/env node
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const path = require("path");
const { DEFAULT_BATCH_SIZE, DEFAULT_CONCURRENCY } = require("./constants");

const run = require("./migrations/migration-runner");

(async () => {
  const argv = yargs(hideBin(process.argv))
    .command("dry-run", "Run fetch -> compute -> export (no patches)", () => {})
    .command("apply", "Apply a proposals file (single batch)", () => {})
    .command("rollback", "Rollback using a backup CSV", () => {})
    .option("batchSize", { type: "number", default: DEFAULT_BATCH_SIZE })
    .option("concurrency", { type: "number", default: DEFAULT_CONCURRENCY })
    .option("proposals", {
      type: "string",
      describe: "Path to proposals XLSX for apply",
    })
    .option("bfile", {
      type: "string",
      describe: "Path to backup CSV for rollback",
    })
    .option("claims", {
      type: "string",
      describe: "Comma-separated claim ids to limit run",
    })
    .option("claims-file", {
      type: "string",
      describe: "File with claim ids to limit run",
    })
    .help().argv;

  const cmd = argv._[0];
  try {
    if (!cmd) {
      console.error("Specify command: dry-run, apply, rollback");
      process.exit(1);
    }
    if (cmd === "dry-run") {
      await run.dryRun({
        batchSize: argv.batchSize,
        concurrency: argv.concurrency,
        claimFilters: argv.claims
          ? argv.claims
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : null,
        claimsFile: argv["claims-file"] || null,
      });
    } else if (cmd === "apply") {
      const proposalsFile = argv.proposals;
      if (!proposalsFile) {
        console.error("apply requires --proposals <path>");
        process.exit(1);
      }
      await run.applyBatch({ proposalsFile, concurrency: argv.concurrency });
    } else if (cmd === "rollback") {
      const file = argv.bfile;
      if (!file) {
        console.error("rollback requires --bfile <path>");
        process.exit(1);
      }
      await run.rollback({ backupFile: file });
    }
    process.exit(0);
  } catch (err) {
    console.error("Fatal:", err);
    process.exit(1);
  }
})();
