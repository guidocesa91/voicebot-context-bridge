import { hashPassword } from "../src/lib/password.js";

const password = process.argv[2];
if (!password) {
  console.error("Uso: pnpm exec tsx scripts/hash-supervisor-password.ts \"la-contrasena\"");
  process.exit(1);
}

console.log(hashPassword(password));
