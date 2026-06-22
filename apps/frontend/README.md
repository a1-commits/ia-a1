# Frontend — AGENTE MOBI

**Next.js** (App Router) + **TypeScript** + **Tailwind CSS v4**, layout escuro por padrão e navegação responsiva (sidebar no desktop, barra inferior no mobile).

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Serve o build |

## Variáveis

`NEXT_PUBLIC_API_URL` — URL base da API visível ao navegador. Deixe vazio para usar a mesma origem do app (`/api` na porta 3000). Ver `.env.example`.

## Pastas

- `app/` — rotas e layouts
- `components/` — UI reutilizável
- `lib/` — cliente HTTP e utilitários
- `hooks/` — autenticação em contexto
- `types/` — tipos da interface
