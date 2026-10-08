# Retained temporary test-schema implementation — review only

No DDL has been executed by this report generator.
This is test isolation, not a migration or an application-schema alteration.
However it does create/drop temporary tables, so the Part 1 no-schema-change boundary needs explicit clarification before use.

Source: scripts/verification/run-messaging-gate.mjs:178–218

```javascript
    const statements = [`CREATE SCHEMA ${q(schema)}`];
    for (const { tablename } of tables.rows) {
      statements.push(`CREATE TABLE ${q(schema)}.${q(tablename)} (LIKE public.${q(tablename)} INCLUDING ALL)`);
    }
    // LIKE copies serial defaults by reference; replace every reference so no
    // public sequence is advanced. Identity columns already get their own sequence.
    serials.rows.forEach(({ table_name, column_name }, i) => {
      const seq = `msg_seq_${i}`;
      statements.push(`CREATE SEQUENCE ${q(schema)}.${q(seq)}`);
      statements.push(`ALTER TABLE ${q(schema)}.${q(table_name)} ALTER COLUMN ${q(column_name)}
        SET DEFAULT nextval('${schema}.${seq}'::regclass)`);
      statements.push(`ALTER SEQUENCE ${q(schema)}.${q(seq)} OWNED BY ${q(schema)}.${q(table_name)}.${q(column_name)}`);
    });
    for (const fk of foreignKeys.rows) {
      // LIKE intentionally does not copy FKs; restore them to the cloned tables.
      const definition = fk.definition.replace(
        /REFERENCES\s+(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_$]*)(?:\.(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_$]*))?/,
        `REFERENCES ${q(schema)}.${q(fk.target_name)}`,
      );
      if (definition === fk.definition) throw new Error("Unsupported foreign-key syntax");
      statements.push(`ALTER TABLE ${q(schema)}.${q(fk.table_name)} ADD CONSTRAINT ${q(fk.name)} ${definition}`);
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(statements.join(";\n"));
      await client.query("COMMIT");
      schemaCreated = true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const isolatedUrl = new URL(process.env.DATABASE_URL);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    isolatedUrl.searchParams.set("application_name", "automation-messaging-verification");
    env.DATABASE_URL = isolatedUrl.href;
    env.MESSAGING_VERIFICATION_SCHEMA = schema;
    env.JOURNEY_DB_WRITES_OK = "1";
```

Cleanup is the existing finally block: `DROP SCHEMA <verified nonce schema> CASCADE`.
No public-table writes/copies, no production target, no production credentials, no migration registration.
