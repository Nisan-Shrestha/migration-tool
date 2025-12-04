// rollbackFromBackup.js
const fs = require("fs");
const path = require("path");
const Decimal = require("decimal.js");
const csvParser = require("csv-parser");
const { HttpConnection } = require("../../http");
const { patchWithRetries } = require("../../utils/helpers");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const PQueue = require("p-queue").default || require("p-queue");

async function rollbackFromBackup({ backupFile }) {
  if (!fs.existsSync(backupFile))
    throw new Error("backupFile not found: " + backupFile);
  const rows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(backupFile)
      .pipe(csvParser())
      .on("data", (d) => rows.push(d))
      .on("end", resolve)
      .on("error", reject);
  });
  console.log("Loaded rows:", rows.length);
  const httpConn = new HttpConnection({ logRequests: false });
  const q = new PQueue({ concurrency: 8 });
  const auditRows = [];
  for (const r of rows) {
    q.add(async () => {
      try {
        const id = String(r.adjustmentId);
        const original = new Decimal(String(r.originalAmount || "0"));
        const resp = await httpConn.get(
          `smvs_claim_adjustment_details(${id})?$select=smvs_amount`
        );
        const current = new Decimal(resp.data.smvs_amount || 0);
        const result = await patchWithRetries(
          httpConn,
          `smvs_claim_adjustment_details(${id})`,
          { smvs_amount: Number(original.toFixed(2)) }
        );
        auditRows.push({
          timestamp: new Date().toISOString(),
          backupFile,
          adjustmentId: id,
          original: original.toFixed(2),
          previous: current.toFixed(2),
          status: result.ok ? "restored" : "failed",
          note: result.ok ? "" : result.err ? result.err.message : "failed",
        });
      } catch (err) {
        auditRows.push({
          timestamp: new Date().toISOString(),
          backupFile,
          adjustmentId: r.adjustmentId,
          original: r.originalAmount,
          previous: "n/a",
          status: "failed",
          note: err?.message || "",
        });
      }
    });
  }
  await q.onIdle();

  const successCount = auditRows.filter((r) => r.status === "restored").length;
  const failedCount = auditRows.filter((r) => r.status === "failed").length;
  console.log(
    `Rollback complete: ${successCount} successfully restored, ${failedCount} failed`
  );

  const auditsDir = path.join(path.dirname(backupFile), "rollback-audit");
  if (!fs.existsSync(auditsDir)) {
    fs.mkdirSync(auditsDir, { recursive: true });
  }
  const parsedBackup = path.parse(backupFile);
  const fileStem = parsedBackup.name || "backup";
  const out = path.join(auditsDir, `${fileStem}.rollback-audit.csv`);
  const writer = createCsvWriter({
    path: out,
    header: [
      { id: "timestamp", title: "timestamp" },
      { id: "backupFile", title: "backupFile" },
      { id: "adjustmentId", title: "adjustmentId" },
      { id: "original", title: "original" },
      { id: "previous", title: "previous" },
      { id: "status", title: "status" },
      { id: "note", title: "note" },
    ],
  });
  await writer.writeRecords(auditRows);
  console.log("Rollback audit saved to", out);
  return { out };
}

module.exports = { rollbackFromBackup };
