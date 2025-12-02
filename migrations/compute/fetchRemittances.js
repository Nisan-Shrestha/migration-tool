// fetchRemittances.js
const { HttpConnection } = require("../../http");
const { fetchAllFetchXml } = require("../../utils/dataverse");

function remittancesFetchXmlForClaim(claimId) {
  return `
<fetch>
  <entity name="smvs_patient_remittance">
    <attribute name="smvs_patient_remittanceid" />
    <attribute name="smvs_remit_type_indicator" />
    <attribute name="smvs_patient_responsibility" />
    <attribute name="smvs_pending_from_additional_payer" />
    <attribute name="smvs_coverage_amount" />
    <attribute name="smvs_adjustment_amount" />
    <attribute name="createdon" />
    <attribute name="smvs_claim_id" />
    <filter>
      <condition attribute="smvs_claim_id" operator="eq" value="${claimId}"/>
      <condition attribute="smvs_remit_type_indicator" operator="in">
        <value>622490000</value>
        <value>622490001</value>
        <value>622490002</value>
      </condition>
    </filter>
  </entity>
</fetch>
`;
}

async function fetchRemittancesForClaim(claimId) {
  const httpConn = new HttpConnection({ logRequests: false });
  const rems = await fetchAllFetchXml(
    httpConn,
    remittancesFetchXmlForClaim(claimId),
    5000,
    false
  );
  return rems;
}

module.exports = { fetchRemittancesForClaim };
