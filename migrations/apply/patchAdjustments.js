// patchAdjustments.js
const ExcelJS = require("exceljs");
const Decimal = require("decimal.js");
const { HttpConnection } = require("../../http");
const { patchWithRetries } = require("../../utils/helpers");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const fs = require("fs");
const path = require("path");
const { default: PQueue } = require("p-queue");

async function applyProposalsFile(proposalsFile, { concurrency = 4 } = {}) {
  if (!fs.existsSync(proposalsFile))
    throw new Error("proposalsFile not found: " + proposalsFile);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(proposalsFile);
  const sheet = workbook.getWorksheet("Proposals");
  if (!sheet)
    throw new Error("Proposals worksheet not found in " + proposalsFile);

  const proposals = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    proposals.push({
      batchId: String(row.getCell(1).value || ""),
      claimId: String(row.getCell(2).value || ""),
      parentRemId: String(row.getCell(3).value || ""),
      adjustmentId: String(row.getCell(4).value || ""),
      currentAmount: new Decimal(String(row.getCell(5).value || "0")),
      newAmount: new Decimal(String(row.getCell(6).value || "0")),
      delta: new Decimal(String(row.getCell(7).value || "0")),
    });
  });

  console.log("Loaded proposals count:", proposals.length);
  const httpConn = new HttpConnection({ logRequests: false });
  const q = new PQueue({ concurrency });

  const auditRows = [];
  for (const p of proposals) {
    q.add(async () => {
      try {
        // verify current value matches expected
        const resp = await httpConn.get(
          `smvs_claim_adjustment_details(${p.adjustmentId})?$select=smvs_amount`
        );

        const currentVal = new Decimal(resp.data.smvs_amount || 0);
        if (!currentVal.eq(p.currentAmount)) {
          auditRows.push({
            timestamp: new Date().toISOString(),
            batchId: p.batchId,
            claimId: p.claimId,
            adjustmentId: p.adjustmentId,
            originalAmount: currentVal.toFixed(2),
            newAmount: p.newAmount.toFixed(2),
            delta: p.newAmount.minus(currentVal).toFixed(2),
            status: "skipped",
            note: "current mismatch",
          });
          return;
        }
        // apply patch
        const patchResult = await patchWithRetries(
          httpConn,
          `smvs_claim_adjustment_details(${p.adjustmentId})`,
          { smvs_amount: Number(p.newAmount.toFixed(2)) }
        );
        if (patchResult.ok) {
          auditRows.push({
            timestamp: new Date().toISOString(),
            batchId: p.batchId,
            claimId: p.claimId,
            adjustmentId: p.adjustmentId,
            originalAmount: p.currentAmount.toFixed(2),
            newAmount: p.newAmount.toFixed(2),
            delta: p.delta.toFixed(2),
            status: "patched",
            note: "",
          });
        } else {
          auditRows.push({
            timestamp: new Date().toISOString(),
            batchId: p.batchId,
            claimId: p.claimId,
            adjustmentId: p.adjustmentId,
            originalAmount: p.currentAmount.toFixed(2),
            newAmount: p.newAmount.toFixed(2),
            delta: p.delta.toFixed(2),
            status: "failed",
            note: patchResult.err
              ? patchResult.err.message || JSON.stringify(patchResult.err)
              : "failed",
          });
        }
      } catch (err) {
        console.log("err", err.message);
        auditRows.push({
          timestamp: new Date().toISOString(),
          batchId: p.batchId,
          claimId: p.claimId,
          adjustmentId: p.adjustmentId,
          originalAmount: p.currentAmount.toFixed(2),
          newAmount: p.newAmount.toFixed(2),
          delta: p.delta.toFixed(2),
          status: "failed",
          note: JSON.stringify(err) || "",
        });
      }
    });
  }

  await q.onIdle();
  console.log("Finished applying proposals.", proposalsFile);
  // write audit
  const auditDir = path.join(path.dirname(proposalsFile), "audit-logs");
  if (!fs.existsSync(auditDir)) {
    fs.mkdirSync(auditDir, { recursive: true });
  }
  const auditFile = pathJoinSafe(auditDir, "audit-log.csv");
  const writer = createCsvWriter({
    path: auditFile,
    header: [
      { id: "timestamp", title: "timestamp" },
      { id: "batchId", title: "batchId" },
      { id: "claimId", title: "claimId" },
      { id: "adjustmentId", title: "adjustmentId" },
      { id: "originalAmount", title: "originalAmount" },
      { id: "newAmount", title: "newAmount" },
      { id: "delta", title: "delta" },
      { id: "status", title: "status" },
      { id: "note", title: "note" },
    ],
    append: fs.existsSync(auditFile),
  });
  await writer.writeRecords(auditRows);
  console.log("Audit saved to", auditFile);

  const summary = {
    total: proposals.length,
    patched: auditRows.filter((r) => r.status === "patched").length,
    skipped: auditRows.filter((r) => r.status === "skipped").length,
    failed: auditRows.filter((r) => r.status === "failed").length,
  };
  return { summary, auditFile };
}
function pathJoinSafe(...parts) {
  return path.join(...parts);
}


module.exports = { applyProposalsFile };
