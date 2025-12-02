const path = require("path");
const fs = require("fs");
const { fetchClaims } = require("./compute/fetchClaims");
const { fetchRemittancesForClaim } = require("./compute/fetchRemittances");
const { fetchAdjustmentsForRemIds } = require("./compute/fetchAdjustments");
const { computeStatsAndProposals } = require("./compute/computeProposals");
const { writeStatsXlsx } = require("./export/writeStatsXlsx");
const { writeProposalsXlsx } = require("./export/writeProposalsXlsx");
const { writeBackupCsv } = require("./export/writeBackupCsv");
const { applyProposalsFile } = require("./apply/patchAdjustments");
const { rollbackFromBackup } = require("./rollback/rollbackFromBackup");
const { chunkArray } = require("../utils/helpers");
const { default: PQueue } = require("p-queue");

const { DEFAULT_BATCH_SIZE, DEFAULT_CONCURRENCY } = require("../constants");

async function dryRun({
  batchSize = DEFAULT_BATCH_SIZE,
  concurrency = DEFAULT_CONCURRENCY,
  claimFilters = null,
  claimsFile = null,
} = {}) {
  console.log("Starting dry-run...");

  // fetch claims IDs (only IDs)
  const claimRows = await fetchClaims();

  let claimIds = claimRows
    .map((r) => r.smvs_claimid)
    .filter(Boolean)
    .map(String);

  // apply filters from command line if any
  if (claimFilters && claimFilters.length > 0) {
    claimIds = claimIds.filter((id) => claimFilters.includes(id));
  } else if (claimsFile) {
    const txt = fs.readFileSync(claimsFile, "utf8");
    const set = new Set(
      txt
        .split(/\r?\n/)
        .map((s) => s.split(",")[0].trim())
        .filter(Boolean)
    );
    claimIds = claimIds.filter((id) => set.has(id));
  }

  console.log(`Claims selected: ${claimIds.length}`);
  if (claimIds.length === 0) return;

  // prepare outputs
  fs.mkdirSync(path.resolve(process.cwd(), "proposals"), { recursive: true });
  fs.mkdirSync(path.resolve(process.cwd(), "backups"), { recursive: true });
  fs.mkdirSync(path.resolve(process.cwd(), "exports"), { recursive: true });

  const statsRows = [];
  let batchIndex = 0;
  const batches = chunkArray(claimIds, batchSize);

  for (const batch of batches) {
    batchIndex++;
    const batchId = `batch_${String(batchIndex).padStart(4, "0")}`;

    console.log(`Processing ${batchId} (${batch.length} claims)`);

    const q = new PQueue({ concurrency });
    const batchProposals = [];

    for (const claimId of batch) {
      q.add(async () => {
        const rems = await fetchRemittancesForClaim(claimId);
        const remIds = rems
          .map((r) => r.smvs_patient_remittanceid)
          .filter(Boolean)
          .map(String);
        let claimAdjDetailRows = [];
        if (remIds.length > 0) {
          claimAdjDetailRows = await fetchAdjustmentsForRemIds(remIds);
          console.log(
            `  Claim ${claimId}: fetched ${rems.length} remittances, ${claimAdjDetailRows.length} adjustments`
          );
        }

        const { stats, proposals } = computeStatsAndProposals(
          claimId,
          rems,
          claimAdjDetailRows
        );

        if (
          stats &&
          (stats.totalAdjSecondary.gt(stats.PendingCapFromPrimary) ||
            stats.totalAdjTertiary.gt(stats.PendingCapFromSecondary))
        ) {
          statsRows.push(stats);
          for (const p of proposals) {
            batchProposals.push({
              batchId,
              claimId,
              adjustmentId: p.adjustmentId,
              parentRemId: p.parentRemId,
              currentAmount: p.currentAmount.toFixed(2),
              newAmount: p.newAmount.toFixed(2),
              delta: p.delta.toFixed(2),
            });
          }
        }
      });
    }
    await q.onIdle();

    const proposalsFile = path.resolve(
      process.cwd(),
      `proposals/Proposed_Adjustments_${batchId}.xlsx`
    );
    await writeProposalsXlsx(proposalsFile, batchProposals);

    const backupFile = path.resolve(
      process.cwd(),
      `backups/backup_${batchId}.csv`
    );
    await writeBackupCsv(
      backupFile,
      batchProposals.map((p) => ({
        adjustmentId: p.adjustmentId,
        claimId: p.claimId,
        originalAmount: p.currentAmount,
        parentRemId: p.parentRemId,
      }))
    );

    console.log(`Finished creating and writing proposals.`);
    console.log(`Total CAD changes proposed rows=${batchProposals.length}`);
  }

  const statsFile = path.resolve(
    process.cwd(),
    "exports",
    "Claim_Adjustment_Cap_Stats.xlsx"
  );
  await writeStatsXlsx(statsFile, statsRows);

  console.log(`Wrote data violation stats xlsx to ${statsFile}`);
  console.log(`Total Claims with data violation: ${statsRows.length}`);

  console.log("Dry-run complete.");
  return { statsFile };
}

async function applyBatch({ proposalsFile, concurrency = 4 } = {}) {
  if (!proposalsFile) throw new Error("proposalsFile required");
  console.log("Applying proposals from:", proposalsFile);
  const result = await applyProposalsFile(proposalsFile, { concurrency });
  console.log("Apply complete:", result.summary || {});
  return result;
}

async function rollback({ backupFile } = {}) {
  if (!backupFile) throw new Error("backupFile required");
  return await rollbackFromBackup({ backupFile });
}

module.exports = { dryRun, applyBatch, rollback };
