const dotenv = require("dotenv");
dotenv.config({ path: [".env", "../.env"] });
const axios = require("axios");
const {
  getAccessToken,
  getTenantMetaUrl,
  initializeTenantConfig,
} = require("@signetic-mvs/multitenant-auth");
const https = require("https");
const http = require("http");
const { inspect } = require("util");
const { warn } = require("console");

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "X-Frame-Options": "sameorigin",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
};
function l(stringToks, ...arr) {
  const retLog =
    arr.reduce((str, item, index) => {
      return (
        str +
        stringToks[index] +
        inspect(item, { colors: true, depth: null, compact: false })
      );
    }, "") + stringToks[stringToks.length - 1];
  return retLog;
}

let multiTenantInitialized = false;
function getAxiosInstance(baseURL, token, customHeaders = {}) {
  let instance;
  if (!instance) {
    instance = axios.create({
      baseURL,
      httpsAgent: new https.Agent({ keepAlive: true, autoSelectFamily: false }),
      httpAgent: new http.Agent({ keepAlive: true, autoSelectFamily: false }),
      headers: Object.assign(
        Object.assign({ Authorization: token }, DEFAULT_HEADERS),
        customHeaders
      ),
    });
  }
  return instance;
}
class HttpConnection {
  constructor(tenant, client, options) {
    if (!options) options = {};
    this.options = options;

    if (!multiTenantInitialized) {
      // console.log("Initializing multi-tenant configuration");
      initializeTenantConfig({
        scope: "EDI_PARSER",
        connStr: process.env.AZURE_STORAGE_CONNECTION_STRING,
      });
    }

    if (client && tenant) {
      this.connectUsingMultiTenantAuth(client, tenant);
    } else {
      this.connectUsingClientCredentials();
    }

    if (this.options.logRequests)
      console.log(
        "debug",
        l`Instantiated HttpConnection for Tenant: ${tenant} and Client: ${client}`
      );
    this.client = client;
    this.tenant = tenant;
    // making sure that the Client and Tenant are correct and have corresponding data
    this.getConnectionAccessToken();
    this.getConnectionBaseURL();
  }

  // connecti using multi-tenant auth
  connectUsingMultiTenantAuth = async (client, tenant) => {
    if (!multiTenantInitialized) {
      initializeTenantConfig({
        scope: "EDI_PARSER",
        connStr: process.env.AZURE_STORAGE_CONNECTION_STRING,
      });
      multiTenantInitialized = true;
    }
    this.getConnectionAccessToken = async () => {
      if (!multiTenantInitialized) {
        initializeTenantConfig({
          scope: "EDI_PARSER",
          connStr: process.env.AZURE_STORAGE_CONNECTION_STRING,
        });
        multiTenantInitialized = true;
      }
      const accessToken = await getAccessToken(tenant, client);
      return accessToken.access_token;
    };
    this.getConnectionBaseURL = async () => {
      if (!multiTenantInitialized) {
        initializeTenantConfig({
          scope: "EDI_PARSER",
          connStr: process.env.AZURE_STORAGE_CONNECTION_STRING,
        });
        multiTenantInitialized = true;
      }
      const tenantMeta = await getTenantMetaUrl(tenant);
      return tenantMeta.BASE_URL;
    };
    const accessToken = await this.getConnectionAccessToken();
    return accessToken;
  };

  connectUsingClientCredentials = async () => {
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;
    const tenantId = process.env.TENANT_ID;
    const baseURL = process.env.BASE_URL;
    let token, expiresOn;
    if (!clientId || !clientSecret || !tenantId || !baseURL) {
      throw new Error(
        "CLIENT_ID, CLIENT_SECRET, TENANT_ID, and BASE_URL must be set in the environment variables"
      );
    }
    this.getConnectionAccessToken = async () => {
      if (!token || !expiresOn || expiresOn < Date.now()) {
        const response = await axios.post(
          `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
          new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "client_credentials",
            scope: `${baseURL}/.default`,
          }),
          {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          }
        );
        token = response.data.access_token;
        expiresOn = Date.now() + response.data.expires_in * 1000 - 5000; // 5 seconds buffer
      }
      return token;
    };
    this.getConnectionBaseURL = async () => {
      return `${baseURL}/api/data/v9.1`;
    };

    const accessToken = await this.getConnectionAccessToken();
    return accessToken;
  };

  // REQUEST METHOD: GET
  get = async (url, customHeaders = {}) => {
    const token = `Bearer ${await this.getConnectionAccessToken()}`;
    const fullURL = `${await this.getConnectionBaseURL()}/${url}`;
    if (this.options.logRequests)
      console.log(
        "info",
        l`GET Request at ::: ${fullURL} for client ::: ${this.client}, tenant :::${this.tenant}`
      );
    const axiosService = getAxiosInstance(fullURL, token, customHeaders);
    return await axiosService.get(fullURL, {
      headers: Object.assign(
        Object.assign({ Authorization: token }, DEFAULT_HEADERS),
        customHeaders
      ),
    });
  };

  // REQUEST METHOD: POST
  post = async (url, data, customHeaders = {}) => {
    const token = `Bearer ${await this.getConnectionAccessToken()}`;
    const fullURL = `${await this.getConnectionBaseURL()}/${url}`;
    if (this.options.logRequests)
      console.log(
        "info",
        l`POST request at ::: ${fullURL} for client ::: ${this.client}, tenant :::${this.tenant}`
      );
    const axiosService = getAxiosInstance(fullURL, token, customHeaders);
    return await axiosService.post(fullURL, data, {
      headers: Object.assign(
        Object.assign({ Authorization: token }, DEFAULT_HEADERS),
        customHeaders
      ),
    });
  };

  // REQUEST METHOD: PATCH
  patch = async (url, data, customHeaders = {}) => {
    const token = `Bearer ${await this.getConnectionAccessToken()}`;
    const fullURL = `${await this.getConnectionBaseURL()}/${url}`;
    if (this.options.logRequests)
      console.log(
        "info",
        l`PATCH request at ::: ${fullURL} for client ::: ${this.client}, tenant :::${this.tenant}`
      );
    const axiosService = getAxiosInstance(fullURL, token, customHeaders);
    return await axiosService.patch(fullURL, data, {
      headers: Object.assign(
        Object.assign({ Authorization: token }, DEFAULT_HEADERS),
        customHeaders
      ),
    });
  };

  // REQUEST METHOD: PUT
  put = async (url, data, customHeaders = {}) => {
    const token = `Bearer ${await this.getConnectionAccessToken()}`;
    const fullURL = `${await this.getConnectionBaseURL()}/${url}`;
    if (this.options.logRequests)
      console.log(
        "info",
        l`PATCH request at ::: ${fullURL} for client ::: ${this.client}, tenant :::${this.tenant}`
      );
    const axiosService = getAxiosInstance(fullURL, token, customHeaders);
    return await axiosService.put(fullURL, data, {
      headers: Object.assign(
        Object.assign({ Authorization: token }, DEFAULT_HEADERS),
        customHeaders
      ),
    });
  };

  // REQUEST METHOD: DELETE
  delete = async (url, customHeaders = {}) => {
    const token = `Bearer ${await this.getConnectionAccessToken()}`;
    const fullURL = `${await this.getConnectionBaseURL()}/${url}`;
    const axiosService = getAxiosInstance(fullURL, token, customHeaders);
    return await axiosService.delete(fullURL, {
      headers: Object.assign(
        Object.assign({ Authorization: token }, DEFAULT_HEADERS),
        customHeaders
      ),
    });
  };

  query = async (fetchXml, customHeaders = {}) => {
    const token = `Bearer ${await this.getConnectionAccessToken()}`;
    const tableName = fetchXml.match(/<entity name="([^"]+)"/)[1];
    const pluralTableName = tableName.endsWith("s")
      ? `${tableName}es`
      : `${tableName}s`;
    const xmlQuery = encodeURIComponent(fetchXml);
    const fullURL = `${await this.getConnectionBaseURL()}/${pluralTableName}?fetchXml=${xmlQuery}`;
    const axiosService = getAxiosInstance(fullURL, token, customHeaders);
    return await axiosService.get(fullURL, {
      headers: Object.assign(
        Object.assign({ Authorization: token }, DEFAULT_HEADERS),
        customHeaders
      ),
    });
  };

  getClient() {
    return this.client;
  }
  getTenant() {
    return this.tenant;
  }
}

module.exports = {
  HttpConnection,
};
