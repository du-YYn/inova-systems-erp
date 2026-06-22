# Deploy — domínios e roteamento público

> **Por que este doc existe:** o roteamento `host → container` **não está no
> repositório**. É config manual no painel do **Easypanel** (reverse proxy
> Traefik). O `docker-compose.yml` só conecta os serviços à rede externa
> `easypanel` com aliases; ele **não tem labels de Traefik**. O
> `nginx/nginx.conf.template` está **inativo** (legado). Sem este registro, um
> subdomínio que para de rotear vira um incidente difícil de diagnosticar.

## Mapa de domínios (produção)

| Host | Container (alias na rede `easypanel`) | Observação |
|------|----------------------------------------|------------|
| `erp.inovasystemssolutions.com` | `grupo_ry_inova-erp_frontend` (Next.js) | App ERP principal |
| `proposta.inovasystemssolutions.com` | `grupo_ry_inova-erp_frontend` (Next.js) | **Mesmo container** do `erp.`; serve a rota pública `/p/<token>` das propostas |
| `cadastro.inovasystemssolutions.com` | `grupo_ry_inova-erp_frontend` | Onboarding público (`/onboarding/<token>`) |
| `parceiro.inovasystemssolutions.com` | `grupo_ry_inova-erp_frontend` | Portal do parceiro |
| `apresentacao.inovasystemssolutions.com` | `grupo_ry_inova-erp_apresentacao_frontend` (Vite) | App Inova Apresentação |
| `apresentacao-api.inovasystemssolutions.com` | `grupo_ry_inova-erp_apresentacao_backend` | API do Apresentação |

> ⚠️ `erp.` e `proposta.` apontam para o **mesmo** container Next.js. O link
> público da proposta é montado a partir do backend (`public_url`, vindo de
> `PROPOSAL_PUBLIC_BASE_URL`) — ver `.env.example`.

## Certificado: use wildcard

Emita/renove um **cert wildcard `*.inovasystemssolutions.com`** no Easypanel em
vez de um cert por subdomínio. Assim, adicionar um host novo **não depende** de
uma emissão Let's Encrypt nova — eliminando a janela em que o subdomínio resolve
no DNS mas ainda não tem listener/cert, que aparece no navegador como
**`ERR_CONNECTION_REFUSED`** (foi exatamente o sintoma observado em `proposta.`).

## Checklist ao adicionar um subdomínio público novo

1. **DNS**: criar o registro A/AAAA apontando para o IP do servidor (mesmo IP do
   `erp.`).
2. **Easypanel**: mapear o domínio para o container correto (ver tabela acima) e
   garantir que o cert wildcard cobre o host.
3. **CSP/CORS** (se a app fizer requests cross-subdomínio): conferir `connect-src`
   no `frontend/middleware.ts` e `CORS_ALLOWED_ORIGINS` no backend.
4. **Validar de fora** antes de divulgar:
   ```bash
   curl -sS -o /dev/null -w "%{http_code} cert=%{ssl_verify_result}\n" \
     https://<novo-host>.inovasystemssolutions.com/
   ```
   Esperado: HTTP `2xx`/`3xx` e `cert=0`.

## Detecção automática no deploy

O `cd.yml` (passo "Deploy via SSH"), após o smoke-test interno do backend, faz um
**probe aviso-only** de `erp.` e `proposta.` (via `curl` do container backend) e
loga `✓`/`⚠` com a remediação. É **aviso-only de propósito**: uma falha de
roteamento/cert é problema de infra (Easypanel), não da imagem — derrubar o
deploy com rollback não resolveria e só geraria churn. O objetivo é **tornar o
problema visível no log do deploy**, que era o gap que deixou o
`ERR_CONNECTION_REFUSED` passar despercebido.
