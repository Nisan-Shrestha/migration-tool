// fetchAdjustments.js
const { HttpConnection } = require("../../http");
const { fetchAllFetchXml } = require("../../utils/dataverse");

// build fetchXml for up to moderate number of remittance ids (chunk externally if needed)
function adjustmentsDetailsFetchXmlForRemIds(remIds) {
  const values = remIds.map((r) => `<value>${r}</value>`).join("\n");
  return `
<fetch>
  <entity name="smvs_claim_adjustment_detail">
    <attribute name="smvs_claim_adjustment_detailid" />
    <attribute name="smvs_amount" />
    <attribute name="smvs_groupcode" />
    <attribute name="smvs_reason_code" />
    <attribute name="createdon" />
    <link-entity name="smvs_patient_remittance" from="smvs_patient_remittanceid" to="smvs_patient_remittance" alias="rem">
      <attribute name="smvs_patient_remittanceid" />
      <attribute name="smvs_remit_type_indicator" />
      <attribute name="smvs_claim_id" />
      <attribute name="smvs_patient_responsibility" />
      <attribute name="smvs_pending_from_additional_payer" />
    </link-entity>
    <filter>
      <condition attribute="smvs_patient_remittance" operator="in">
        ${values}
      </condition>
    </filter>
  </entity>
</fetch>
`;
}

async function fetchAdjustmentDetailsForRemittanceIds(remIds) {
  const httpConn = new HttpConnection({ logRequests: false });
  // chunk if remIds large
  const chunks = [];
  const chunkSize = 50;
  for (let i = 0; i < remIds.length; i += chunkSize)
    chunks.push(remIds.slice(i, i + chunkSize));
  const allCAD = [];
  for (const chunk of chunks) {
    const xml = adjustmentsDetailsFetchXmlForRemIds(chunk);
    const claimAdjustmentDetails = await fetchAllFetchXml(
      httpConn,
      xml,
      2000,
      false
    );
    // normalize
    for (const cad of claimAdjustmentDetails) {
      const adjId = cad.smvs_claim_adjustment_detailid;
      const amount = cad.smvs_amount || 0;
      const groupCode = cad.smvs_groupcode;
      const reasonCode = cad.smvs_reason_code;

      const parentRemId = cad["rem.smvs_patient_remittanceid"] || null;

      const remitTypeIndicator = cad["rem.smvs_remit_type_indicator"];
      const claimId = cad["rem.smvs_claim_id"];
      const patientResponsibility = cad["rem.smvs_patient_responsibility"];
      const pendingFromAdditionalPayer =
        cad["rem.smvs_pending_from_additional_payer"];

      allCAD.push({
        raw: cad,
        adjId: adjId ? String(adjId) : null,
        amount: amount,
        groupCode: groupCode,
        reasonCode: reasonCode,
        parentRemId: parentRemId ? String(parentRemId) : null,
        remitTypeIndicator:
          remitTypeIndicator !== null && remitTypeIndicator !== undefined
            ? Number(remitTypeIndicator)
            : null,
        claimId: claimId,
        patientResponsibility: patientResponsibility,
        pendingFromAdditionalPayer: pendingFromAdditionalPayer,
      });
    }
  }
  return allCAD;
}

module.exports = {
  fetchAdjustmentsForRemIds: fetchAdjustmentDetailsForRemittanceIds,
};
