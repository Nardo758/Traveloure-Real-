const crypto = require('crypto');

async function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(salt + ':' + derivedKey.toString('hex'));
    });
  });
}

async function main() {
  const password = 'TestPass123!';
  const hash = await hashPassword(password);
  console.log('Hash:', hash);
  console.log('Length:', hash.length);
  
  // Also generate a UUID for id
  const { randomUUID } = crypto;
  const id = randomUUID();
  console.log('ID:', id);
  
  // SQL to insert user
  const email = 'nyc-art@traveloure.test';
  const firstName = 'Marcus';
  const lastName = 'Chen';
  const role = 'expert';
  const bio = 'NYC Art Expert';
  const specialties = JSON.stringify(['art', 'nyc', 'museums']);
  const authProvider = 'email';
  const now = new Date().toISOString();
  
  console.log('\nSQL INSERT:');
  console.log(`
INSERT INTO users (id, email, password, first_name, last_name, role, bio, specialties, auth_provider, created_at, updated_at, suspended)
VALUES (
  '${id}',
  '${email}',
  '${hash}',
  '${firstName}',
  '${lastName}',
  '${role}',
  '${bio}',
  '${specialties}',
  '${authProvider}',
  '${now}',
  '${now}',
  false
);
  `);
}

main().catch(console.error);