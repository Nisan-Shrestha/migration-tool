// writeBackupCsv.js
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const fs = require("fs");

async function writeBackupCsv(destPath, rows) {
  fs.mkdirSync(require("path").dirname(destPath), { recursive: true });
  if (!rows || rows.length === 0) {
    // write empty file header
    const w = createCsvWriter({
      path: destPath,
      header: [
        { id: "adjustmentId", title: "adjustmentId" },
        { id: "claimId", title: "claimId" },
        { id: "originalAmount", title: "originalAmount" },
        { id: "parentRemId", title: "parentRemId" },
      ],
    });
    await w.writeRecords([]);
    return;
  }
  const w = createCsvWriter({
    path: destPath,
    header: [
      { id: "adjustmentId", title: "adjustmentId" },
      { id: "claimId", title: "claimId" },
      { id: "originalAmount", title: "originalAmount" },
      { id: "parentRemId", title: "parentRemId" },
    ],
  });
  await w.writeRecords(rows);
  console.log("Wrote backup CSV to", destPath);
}

module.exports = { writeBackupCsv };
