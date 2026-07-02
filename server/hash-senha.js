// Gera o hash da senha do gerente pra colocar em GERENTE_SENHA_HASH no .env.
// Uso: npm run hash-senha -- "minha-senha"
const { hashSenha } = require("./auth.js");

const senha = process.argv[2];
if (!senha) {
  console.error('Uso: npm run hash-senha -- "sua-senha"');
  process.exit(1);
}

hashSenha(senha).then((hash) => console.log(hash));
