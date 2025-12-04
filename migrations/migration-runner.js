const fs = require("fs");
const path = require("path");

const Decimal = require("decimal.js");
const { chunkArray } = require("../utils/helpers");
const { fetchClaims } = require("./queries/fetchClaims");
const { writeStatsXlsx } = require("./export/writeStatsXlsx");
const { writeBackupCsv } = require("./export/writeBackupCsv");
const { applyProposalsFile } = require("./apply/patchAdjustments");
const { writeProposalsXlsx } = require("./export/writeProposalsXlsx");
const { rollbackFromBackup } = require("./rollback/rollbackFromBackup");
const { fetchRemittancesForClaim } = require("./queries/fetchRemittances");
const { computeStatsAndProposalsV2 } = require("./compute/computeProposals");
const { fetchAdjustmentsForRemIds } = require("./queries/fetchAdjustments");

const { default: PQueue } = require("p-queue");

const {
  DEFAULT_BATCH_SIZE,
  DEFAULT_CONCURRENCY,
  REMIT_SECONDARY,
  REMIT_TERTIARY,
} = require("../constants");

async function dryRun({
  batchSize = DEFAULT_BATCH_SIZE,
  concurrency = DEFAULT_CONCURRENCY,
  claimFilters = null,
  claimsFile = null,
} = {}) {
  console.log("Starting dry-run...");

  // fetch claims IDs having atleast one Claim Adjustment Detail with smvs_amount > 0 in any of its remittance. (only IDs)
  const claimRows = await fetchClaims();

  let claims = claimRows.filter((r) => Boolean(r.smvs_claimid));

  // apply filters from command line if any
  if (claimFilters && claimFilters.length > 0) {
    claims = claims.filter((r) => claimFilters.includes(r.smvs_claimid));
  } else if (claimsFile) {
    const txt = fs.readFileSync(claimsFile, "utf8");
    const set = new Set(
      txt
        .split(/\r?\n/)
        .map((s) => s.split(",")[0].trim())
        .filter(Boolean)
    );
    claims = claims.filter((r) => set.has(r.smvs_claimid));
  }

  console.log(`Claims selected for processing: ${claims.length}`);
  if (claims.length === 0) return;
  // prepare outputs
  const reportsDir = path.resolve(process.cwd(), "reports");
  const proposalsDir = path.resolve(reportsDir, "proposals");
  const backupsDir = path.resolve(reportsDir, "backups");
  const exportsDir = path.resolve(reportsDir, "exports");

  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(proposalsDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
  fs.mkdirSync(exportsDir, { recursive: true });

  let batchIndex = 0;
  const statsRows = [];
  const batches = chunkArray(claims, batchSize);

  for (const batch of batches) {
    batchIndex++;
    const batchId = `batch_${String(batchIndex).padStart(4, "0")}`;

    console.log(`Processing ${batchId} (${batch.length} claims)`);

    const q = new PQueue({ concurrency });
    const batchProposals = [];

    for (const claim of batch) {
      q.add(async () => {
        const claimedAmt = Decimal(claim.smvs_claimed_amount || 0);
        const receivedAmt = Decimal(claim.smvs_recieved_amount || 0);
        const patientResp = Decimal(
          claim.smvs_patient_responsible_payment || 0
        );
        const pendingAdditionalPayer = Decimal(
          claim.smvs_pending_from_additional_payer || 0
        );
        const currentAdjustmentAmt = Decimal(claim.smvs_adjustment_amount || 0);
        const PRAmt = Decimal.max(pendingAdditionalPayer, patientResp);

        const adjustmentCap = claimedAmt.minus(receivedAmt).minus(PRAmt);
        const amountToReduce = currentAdjustmentAmt.minus(adjustmentCap);

        if (amountToReduce.lte(0)) {
          // no violation
          return;
        }

        // fetch 2ndary and tertiary remittances for claim
        const remittanceResult = await fetchRemittancesForClaim(
          claim.smvs_claimid
        );
        const remittances = remittanceResult.filter((r) =>
          Boolean(r.smvs_patient_remittanceid)
        );

        const sortRemittanceByType = (type) =>
          remittances
            .filter((r) => Number(r.smvs_remit_type_indicator) === type)
            .sort(
              (a, b) =>
                new Date(b.smvs_check_processed_date) -
                new Date(a.smvs_check_processed_date)
            );

        const remIds = remittances.map((r) =>
          String(r.smvs_patient_remittanceid)
        );

        let claimAdjDetailRows = [];
        claimAdjDetailRows = await fetchAdjustmentsForRemIds(remIds);

        const tertiaryRems = sortRemittanceByType(REMIT_TERTIARY);
        const secondaryRems = sortRemittanceByType(REMIT_SECONDARY);

        const { proposals, totalReduced, remainingToReduce } =
          computeStatsAndProposalsV2(
            claim.smvs_claimid,
            secondaryRems,
            tertiaryRems,
            claimAdjDetailRows,
            amountToReduce
          );
        const statistics = {
          claimId: claim.smvs_claimid,
          claimedAmt,
          receivedAmt,
          patientResp,
          pendingAdditionalPayer,
          PRAmt,
          currentAdjustmentAmt,
          adjustmentCap,
          amountToReduce,
          totalReduced,
          remainingToReduce,
        };

        statsRows.push(statistics);
        for (const p of proposals) {
          batchProposals.push({
            batchId,
            claimId: claim.smvs_claimid,
            adjustmentId: p.adjustmentId,
            parentRemId: p.parentRemId,
            currentAmount: p.currentAmount.toFixed(2),
            newAmount: p.newAmount.toFixed(2),
            delta: p.delta.toFixed(2),
          });
        }
      });
    }
    await q.onIdle();

    const proposalsFile = path.resolve(
      proposalsDir,
      `Proposed_Adjustments_${batchId}.xlsx`
    );

    await writeProposalsXlsx(proposalsFile, batchProposals);

    const backupFile = path.resolve(backupsDir, `backup_${batchId}.csv`);
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

  const statsFile = path.resolve(exportsDir, "Claim_Adjustment_Cap_Stats.xlsx");
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
