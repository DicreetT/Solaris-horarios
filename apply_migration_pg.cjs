const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.ryemqddhchdmywmlmhlx:sOq_E1f@3H6bZ*@aws-0-eu-west-3.pooler.supabase.com:5432/postgres';

const client = new Client({
    connectionString,
});

async function runMigration() {
    try {
        await client.connect();
        console.log('Connected to database.');

        const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20260226020000_admin_request_policies.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Executing migration...');
        await client.query(sql);
        console.log('Migration applied successfully.');

    } catch (err) {
        console.error('Error applying migration:', err);
    } finally {
        await client.end();
    }
}

runMigration();
