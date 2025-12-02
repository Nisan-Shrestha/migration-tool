// writeProposalsXlsx.js
const ExcelJS = require("exceljs");
const fs = require("fs");

async function writeProposalsXlsx(destPath, proposalRows) {
  fs.mkdirSync(require("path").dirname(destPath), { recursive: true });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Proposals");
  ws.columns = [
    { header: "batchId", key: "batchId", width: 12 },
    { header: "claimId", key: "claimId", width: 40 },
    { header: "RemittanceId", key: "parentRemId", width: 40 },
    { header: "adjustmentId", key: "adjustmentId", width: 40 },
    { header: "currentAmount", key: "currentAmount", width: 12 },
    { header: "newAmount", key: "newAmount", width: 12 },
    { header: "delta", key: "delta", width: 12 },
  ];
  for (const r of proposalRows) {
    ws.addRow(r);
  }
  await wb.xlsx.writeFile(destPath);
  console.log("Wrote proposals xlsx to", destPath);
}

module.exports = { writeProposalsXlsx };
