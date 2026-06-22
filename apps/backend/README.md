# Backend — AGENTE MOBI

API **Express** + **TypeScript** + **Prisma**, organizada por domínios (`auth`, `chat`, `memory`, `tasks`, `reflections`, `ai`, `user`, `health`, `files`).

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Desenvolvimento com `tsx watch` |
| `npm run build` | Compila para `dist/` |
| `npm start` | Produção (`node dist/server.js`) |
| `npm run db:generate` | Gera Prisma Client |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:migrate:dev` | Migrations em dev |
| `npm run db:seed` | Seed (usuário demo) |

## Variáveis

Veja `.env.example` na mesma pasta.

## IA

- `domains/ai`: contrato `AiProvider`, implementação OpenAI e fallback mock.
- Sem `OPENAI_API_KEY`, o sistema usa o mock e continua respondendo no chat.
