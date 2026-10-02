// Test-process isolation only; never loaded by the application.
const schema = process.env.MESSAGING_VERIFICATION_SCHEMA;
if (process.env.NODE_ENV !== "test" || process.env.ENVIRONMENT !== "TEST" ||
    !/^automation_msg_[a-f0-9]{16}$/.test(schema || "")) {
  throw new Error("Refusing messaging verifier outside its isolated test schema");
}
const url = new URL(process.env.DATABASE_URL);
if (url.searchParams.get("options") !== `-c search_path=${schema}`) {
  throw new Error("Messaging verifier requires an isolated, no-fallback search path");
}

// connect-pg-simple defaults to an explicitly qualified public.sessions table,
// ignoring the connection's search_path. Override only its test-process factory.
const sessionModule = require.resolve("connect-pg-simple");
const originalFactory = require(sessionModule);
require.cache[sessionModule].exports = function isolatedSessionFactory(session) {
  const Store = originalFactory(session);
  return class IsolatedSessionStore extends Store {
    constructor(options) {
      super({ ...options, schemaName: schema });
    }
  };
};

// An explicit public qualifier or search-path reset would escape the fixture
// namespace. Reject it before a query is sent, regardless of transport stubs.
const pg = require("pg");
const originalQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function isolatedQuery(query, ...args) {
  const text = typeof query === "string" ? query : query?.text || "";
  if (/\b"?public"?\s*\./i.test(text) ||
      /\bset\s+(?:local\s+)?search_path\b/i.test(text)) {
    throw new Error("Refusing SQL that escapes the messaging fixture namespace");
  }
  return originalQuery.call(this, query, ...args);
};