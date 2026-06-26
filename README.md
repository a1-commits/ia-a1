# AGENTE MOBI

Assistente pessoal inteligente, **privado** e **modular**, pensado para rodar no seu computador-servidor: rotina, trabalho, memória, reflexões e decisões — com interface web rápida (mobile-first) e base pronta para integrações futuras (WhatsApp, OneDrive, múltiplos modelos).

## Stack

| Camada    | Tecnologia                          |
|----------|--------------------------------------|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| Backend  | Node.js, Express, TypeScript, Zod  |
| Banco    | PostgreSQL                           |
| ORM      | Prisma                               |
| IA       | Camada de provedores (OpenAI + fallback mock) |
| Infra    | Docker Compose (Postgres + API + Web) |

## Estrutura

```
apps/backend/     API Express + Prisma
apps/frontend/    Interface Next.js
packages/shared/  Tipos compartilhados
infra/docker/     Docker Compose e Dockerfiles
storage/          logs, uploads, backups, memory, exports
```

## Pré-requisitos

- Node.js 20+
- npm
- PostgreSQL (local ou via Docker)

Opcional: Docker Desktop (para subir tudo em containers).

## Configuração de ambiente

1. Copie os exemplos:

   - `apps/backend/.env.example` → `apps/backend/.env`
   - `apps/frontend/.env.example` → `apps/frontend/.env.local`

2. Ajuste `DATABASE_URL` no backend para o seu Postgres.

3. `JWT_SECRET`: use um valor longo e aleatório em produção.

4. `OPENAI_API_KEY` é **opcional**. Sem chave, o chat usa resposta **mock/offline** e o sistema continua funcional.

5. `NEXT_PUBLIC_API_URL` deve ser a URL que o **navegador** usa para chamar a API (ex.: `http://localhost:4000` no PC; na LAN, use o IP do servidor, ex.: `http://192.168.1.10:4000`).

## Como rodar (desenvolvimento)

Na raiz do repositório (`D:\AGENTE DE IA MOBI`):

```bash
npm install
```

Suba o PostgreSQL (exemplo com Docker, se tiver Docker instalado):

```bash
npm run docker:postgres
```

(Equivalente: `docker compose -f infra/docker/docker-compose.yml up -d postgres` na raiz do projeto.)

Na primeira vez, aplique migrations e seed (usuário demo):

```bash
cd ..\..
npm run db:generate
cd apps\backend
npx prisma migrate deploy
npx prisma db seed
cd ..\..
```

Credenciais demo (após seed): `demo@agente.mobi` / `demo123`

Em dois terminais:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

- **Frontend:** http://localhost:3000  
- **Backend:** http://localhost:4000  
- **Health:** http://localhost:4000/health — responde **sempre HTTP 200**; o campo `database` indica `up` ou `down` (útil para smoke test sem Postgres ainda).

## Validação rápida

1. Com o backend no ar: `GET http://localhost:4000/` → JSON com nome da API.  
2. `GET http://localhost:4000/health` → `{ "status": "ok"|"degraded", "database": "up"|"down" }`.  
3. Com Postgres + migrations + seed: login em http://localhost:3000/login com `demo@agente.mobi` / `demo123`.  
4. Sem `OPENAI_API_KEY`, o chat responde em modo **mock/offline**.  

## Docker Compose (tudo junto)

Com Docker instalado, na raiz do projeto:

```bash
copy infra\docker\.env.example infra\docker\.env
npm run docker:up
```

(O compose sobe Postgres com **healthcheck**, depois backend e frontend; o backend aplica migrations e seed na subida.)

Ajuste variáveis em `infra/docker/.env` se necessário. O backend executa `prisma migrate deploy` e o seed na subida do container.

## Deploy em produção (PM2 / servidor)

O diretório `.next` **não vai para o Git**. Após cada `git pull`, gere o build antes de reiniciar o frontend:

```bash
npm run install:deploy
# ou: npm install && npm run build:frontend
pm2 restart mobi-frontend
```

Use `infra/pm2/ecosystem.config.example.cjs` como base. O frontend deve iniciar com `npm run start` em `apps/frontend` (monorepo com dependências na raiz).

Se usar Nginx, encaminhe **todas** as rotas — inclusive `/_next/static` — para a porta do Next (3000). Ver `infra/nginx/frontend.conf.example`.

## Endpoints úteis (API)

| Método | Caminho | Descrição |
|--------|---------|-----------|
| GET | `/health` | Health check (inclui ping ao banco) |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Registro |
| GET | `/api/ai/test` | Teste do provedor de IA (requer Bearer) |
| POST | `/api/chat/message` | Envia mensagem e persiste resposta |
| GET | `/api/conversations` | Lista conversas |
| … | `/api/memories`, `/api/tasks`, `/api/reflections` | CRUD conforme implementado |

Todas as rotas autenticadas usam `Authorization: Bearer <token>`.

## Próximos passos sugeridos

- Autenticação mais robusta (refresh tokens, OAuth)
- RAG com documentos em `storage/uploads`
- Conectores WhatsApp / OneDrive
- Filas para tarefas longas e telemetria em `storage/logs`

## Licença

Uso privado do autor do projeto — ajuste conforme sua necessidade.
