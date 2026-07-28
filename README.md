# teamuniz

Plataforma de atendimento via WhatsApp com backend de multi-atendimento, bot e webapp de gestão.

## Estrutura

```
chat_box/
├── backend/            # API (Node.js + TypeScript + Sequelize/PostgreSQL)
├── frontbot/           # Bot WhatsApp (server.js)
│   └── webapp/         # Painel de gestão (Next.js)
├── ecosystem.config.js # Configuração PM2 dos 3 serviços
├── dev                 # Script: para produção e libera portas para dev
└── prod                # Script: builda e sobe tudo em produção via PM2
```

## Serviços

| Serviço             | Diretório         | Porta | Stack                  |
|----------------------|-------------------|-------|-------------------------|
| `teamuniz-backend`   | `backend/`        | 4002  | Node.js, TypeScript, Sequelize, Redis |
| `teamuniz-frontend`  | `frontbot/webapp/`| 4003  | Next.js                |
| `teamuniz-bot`       | `frontbot/`       | 3002  | Node.js (WhatsApp bot)  |

## Setup local

Pré-requisitos: Node.js, PostgreSQL, Redis.

```bash
# Backend
cd backend
cp .env.example .env   # preencha as credenciais
npm install
npm run db:migrate
npm run dev:server

# Webapp
cd frontbot/webapp
cp .env.example .env
npm install
npm run dev

# Bot
cd frontbot
cp .env.example .env
npm install
npm start
```

## Deploy (produção)

Gerenciado via [PM2](https://pm2.keymetrics.io/) com `ecosystem.config.js`.

```bash
./dev   # para os serviços de produção e libera as portas para desenvolvimento
./prod  # builda backend + webapp e sobe os 3 processos via PM2
```

> Os scripts `dev`/`prod` referenciam caminhos fixos do servidor de produção — ajuste-os se for reaproveitar em outro ambiente.

## Variáveis de ambiente

Cada serviço tem seu próprio `.env` (não versionado). Use os respectivos `.env.example` como referência. Nunca commite arquivos `.env` reais, credenciais ou a pasta `frontbot/auth_info/` (sessão do WhatsApp).
