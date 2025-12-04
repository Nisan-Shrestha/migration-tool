// fetchRemittances.js
const { HttpConnection } = require("../../http");
const { fetchAllFetchXml } = require("../../utils/dataverse");

function remittancesFetchXmlForClaim(claimId) {
  return `
<fetch distinct="true">
  <entity name="smvs_patient_remittance">
    <attribute name="smvs_patient_remittanceid"/>
    <attribute name="smvs_remit_type_indicator"/>
    <attribute name="smvs_check_processed_date"/>
    <attribute name="smvs_claim_id"/>
    
    <!-- 1st: sort remit type so 622490002 comes first -->
    <order attribute="smvs_remit_type_indicator" descending="true"/>
    
    <!-- 2nd: sort latest check processed date -->
    <order attribute="smvs_check_processed_date" descending="true"/>
    
    <filter>
      <condition attribute="smvs_claim_id" operator="eq" value="${claimId}"/>
      <condition attribute="smvs_remit_type_indicator" operator="in">
        <value>622490001</value>
        <value>622490002</value>
      </condition>
    </filter>
    
    <link-entity name="smvs_claim_adjustment_detail" from="smvs_patient_remittance" to="smvs_patient_remittanceid" link-type="inner" alias="cad">
      <filter>
        <condition attribute="smvs_amount" operator="gt" value="0"/>
      </filter>
    </link-entity>
  
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
