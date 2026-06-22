import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = 'demo@agente.mobi';
  const password = 'demo123';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Seed: usuário demo já existe.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: 'Usuário Demo',
      role: 'ADMIN',
    },
  });

  console.log('Seed: usuário demo criado.');
  console.log(`  E-mail: ${email}`);
  console.log(`  Senha:  ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
