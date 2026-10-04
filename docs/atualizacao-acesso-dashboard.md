# Atualização: solicitações de acesso e dashboard

## Escopo e preservação

Atualização incremental do NC SORTER existente, projeto Supabase `uhjwpueaxjeczzxxxovd`. O primeiro ADMIN não foi recriado nem teve senha, role, atividade ou perfil alterados. O proprietário confirmou que conseguiu entrar normalmente após a migration. Os dois perfis originais e a ocorrência existente foram preservados. HU e Package ID continuam opcionais. O campo livre de usuário da ocorrência, o autor autenticado e a regra configurável de reincidência continuam separados e inalterados.

## Arquivos criados

- `schemas/access-request.ts`: validação pública e decisões administrativas.
- `lib/access-request-types.ts`: contrato das solicitações.
- `services/access-requests.ts`: criação pelo Auth, filtros, paginação e decisões.
- `components/access-request-form.tsx`, `components/access-request-count.tsx`: formulário público e badge real.
- `components/operational/access-requests.tsx`: lista, filtros, detalhes e confirmação de aprovação/recusa.
- `app/solicitar-acesso/page.tsx`: rota pública.
- `lib/dashboard.ts`, `components/dashboard/charts.tsx`, `components/dashboard/filters.tsx`: componentes e contratos reutilizáveis do dashboard.
- `db/access-requests-dashboard.sql`: SQL incremental revisável.
- `supabase/migrations/20261002210146_access_requests_dashboard.sql`: espelho da migration aplicada.
- `tests/access-dashboard.test.ts`: testes novos de validação, SQL, RLS e indicadores.
- Este relatório. Scripts de verificação real e navegador ficam em `work/`, fora do pacote de código.

## Arquivos alterados

- `app/login/page.tsx`, `components/login-form.tsx`: link de solicitação e navegação após login.
- `app/(private)/[...section]/page.tsx`, `components/shell.tsx`: rota e menu exclusivos do ADMIN.
- `app/api/[...path]/route.ts`: endpoints novos e distinção entre credencial inválida e falha de conexão.
- `lib/auth.ts`: mensagem apropriada para conta sem acesso aprovado/inativa; mesma exigência de perfil ativo.
- `components/operational/dashboard.tsx`: composição do novo painel.
- `components/operational/shared.tsx`: evita mostrar dados de filtros anteriores enquanto a nova consulta carrega.
- `app/globals.css`: telas públicas, administração, gráficos, legendas, ranking e mapa de calor responsivos.
- `types/database.ts`: tipos atualizados a partir do banco real.
- `README.md`: instruções e estado da atualização.

## Migration e banco

A CLI gerou inicialmente `20261002203345_access_requests_dashboard.sql`; após aplicar pelo conector, o arquivo local foi alinhado à versão real `20261002210146_access_requests_dashboard`.

Adicionados:

- Tabela `access_requests`, com unicidade de e-mail, usuário normalizado e conta Auth; estados consistentes e dados de decisão.
- Índices de status/data e responsáveis pelas decisões.
- RLS: somente ADMIN ativo pode ler solicitações. Nenhum cliente anônimo ou autenticado tem permissão de escrita direta nessa tabela.
- Trigger privado em INSERT de `auth.users`: recebe apenas o pedido inicial e cria solicitação PENDENTE de forma atômica com a conta Auth. Não cria perfil nem libera permissões.
- RPC `decide_access_request`, wrapper invoker de função privada, verifica ADMIN real e bloqueia a linha durante a decisão. Aprovação cria perfil ativo na mesma transação; recusa mantém a conta sem perfil autorizado.
- Trigger de proteção contra ativação de solicitação não aprovada por outra API.
- Auditoria adicional de solicitações, mudanças de role, ativação e desativação. O evento público inicial tem ator de perfil nulo e identifica o solicitante por `auth_user_id` no payload; nenhum segredo é registrado.
- RPC `dashboard_v2`, invoker, com autorização de ADMIN/LIDER, agregações no banco e consulta limitada às dez últimas ocorrências. A RPC antiga `dashboard` continua atendendo relatórios existentes.

Nenhuma exclusão de dados nem reescrita dos usuários existentes foi necessária.

## Rotas e APIs

| Rota/API | Acesso e finalidade |
| --- | --- |
| `/solicitar-acesso` | Formulário público, sem login automático |
| `/administracao/solicitacoes` | Apenas ADMIN, inclusive por URL direta |
| `POST /api/access-requests` | Recebe solicitação OPERADOR/LIDER, valida senha e confirmação |
| `GET /api/access-requests` | ADMIN; busca, role, status, período e paginação de 25 itens |
| `GET /api/access-requests/:id` | ADMIN; detalhes |
| `POST /api/access-requests/:id` | ADMIN; decisão APROVADO/RECUSADO com role ou motivo |
| `GET /api/dashboard-v2` | ADMIN/LIDER; agregações filtradas e agrupamento |

## Segurança e senhas

As senhas são enviadas somente ao Supabase Auth e não são armazenadas em tabelas da aplicação ou logs. O endpoint exige 12–128 caracteres, maiúscula, minúscula, número e confirmação igual. ADMIN é rejeitado pelo Zod e pelas constraints/funções do banco no fluxo público. A promoção a ADMIN permanece na administração de usuários e é auditada.

O servidor usa a variável privada já existente. Nenhuma secret está no bundle público ou no pacote entregue. As decisões usam a sessão do administrador e a role ativa do banco, sem confiar em `user_metadata`, localStorage ou menus. Contas pendentes/recusadas não têm perfil autorizado; contas inativas perdem acesso nas APIs e na RLS mesmo com token ainda válido.

O fluxo usa criação de conta Auth no servidor, com aprovação humana no NC SORTER. Não depende de SMTP e não envia e-mail de aprovação. A criação técnica no Auth não comprova posse do endereço: o ADMIN deve conferir a identidade/e-mail do solicitante antes de aprovar. Os convites administrativos anteriores continuam disponíveis com suas configurações próprias de e-mail.

## Dashboard

- Filtros aplicados no banco: período, turno, canalização; atalhos Hoje, 7 dias, 30 dias, mês e datas personalizadas.
- Comparação com janela anterior de igual número de dias e mesmos filtros. Sem divisão por zero ou porcentagem inventada; os períodos comparados são exibidos.
- Cards com sparklines quando há mais de um intervalo e dados; taxa de resolvidas substitui tempo de resolução.
- Evolução por dia/semana/mês com preenchimento de intervalos sem ocorrências. Para períodos longos, agrupamento é ajustado para limitar o volume retornado e informado na tela. Limite de período: 3.660 dias.
- Donuts de erros e status, barras de turnos e canalizações, ranking normalizado do usuário da ocorrência, mapa de calor de 2 horas no fuso São Paulo e tabela de últimas ocorrências.
- Média móvel de sete intervalos, somente histórica; nenhum `closedAt` ou previsão futura foi criado. As séries por status refletem o status atual de cada ocorrência, não um histórico de transições.
- Links dos cards, legendas, barras e ranking mantêm o período e os filtros ao abrir a lista.
- Skeleton, estado vazio e mensagem de erro; dados anteriores não ficam apresentados sob filtros novos.

## Validação

Testes automatizados locais cobrem cadastro público, rejeição de ADMIN e senha inválida, duplicidades, RLS de pendentes/recusados, decisões ADMIN, aprovação de LIDER como OPERADOR, decisão repetida, auditoria, preservação do primeiro ADMIN, agregações, comparação, horários do mapa, períodos vazios e agrupamentos.

A suíte anterior continua verificando ocorrências, status, filtros, exportação, concorrência lógica por versão, auditoria, catálogos inativos e regra da quinta ocorrência. Ela roda em PostgreSQL PGlite isolado, sem inserir ocorrências fictícias no projeto real.

Verificações reais usaram contas explicitamente autorizadas e identificadas como `Homologação automática murgckp6`. As três contas aprovadas foram desativadas; a quarta está recusada. A função ADMIN temporária foi removida. Não restam contas de teste ativas nem pendentes. Seu histórico é preservado. A ocorrência operacional não foi editada nem removida durante os testes.

### Resultado dos testes

- Cinco testes automatizados passaram: dois da suíte anterior e três novos, com múltiplas verificações de SQL/RLS, validação, navegação e filtros. Os três novos foram repetidos após ampliar a cobertura dos filtros.
- `npm run build`: passou; `npm run lint`: passou sem avisos; TypeScript: passou.
- Supabase real: solicitação OPERADOR/LIDER, rejeição de ADMIN público, duplicidade de e-mail/usuário e bloqueio de pendentes passaram.
- Login real de OPERADOR/LIDER aprovados e negação das APIs administrativas passaram; dashboard e exportação funcionaram com a ocorrência real.
- Playwright/Edge: formulário sem opção ADMIN; aprovação de LIDER como OPERADOR; recusa com motivo; auditoria; badge; navegação por tipo de erro mantendo período; gráficos com dados e estado vazio; telas desktop e mobile passaram.
- Capturas de tela foram inspecionadas. Houve correção de CSS antigo no preview e de overflow da tabela; a validação final foi feita com a versão compilada.
- O proprietário confirmou o login do ADMIN original. A comparação no banco confirmou os dois perfis originais com role, atividade e `updated_at` intactos, e a mesma quantidade de ocorrências (uma).
- `EXPLAIN ANALYZE`: dashboard agregado em 14,271 ms com a amostra atual; não representa benchmark de carga.

## Configuração e limites

Nenhuma variável nova é necessária no ambiente local. A publicação externa e a transferência da chave secreta foram autorizadas. O código está no repositório privado https://github.com/henrypradel9-droid/nc-sorter-manual, conectado ao projeto Vercel `nc-sorter-manual` da conta JAMSLY. O endereço de produção é https://nc-sorter-manual.vercel.app e `APP_ORIGIN` está configurado com essa origem. A `SUPABASE_SECRET_KEY` está armazenada como Secret somente de produção, usada apenas no servidor. O arquivo `.env.local` não foi enviado ao GitHub nem ao pacote de deploy. Antes de exposição ampla à internet, configure proteção contra abuso de cadastro no provedor/infraestrutura.

### Publicação em 04/10/2026

- Deploy de produção confirmado como READY: `dpl_EttQdxkWmJehHyokHLG5ARhuEoMN`, commit de aplicação `595bfad`, compilação em 55 segundos e funções em São Paulo (`gru1`).
- A primeira compilação identificou uma configuração local antiga de Vite/Sites; `vite.config.ts` foi excluído da verificação TypeScript do app Next.js. A verificação TypeScript e o novo build passaram.
- `/login`, `/solicitar-acesso` e a logo oficial responderam HTTP 200. APIs administrativas e dashboard recusaram usuários não autenticados com HTTP 401.
- Solicitação vazia foi rejeitada com HTTP 400 e login com conta inexistente com HTTP 401, sem criar contas nem alterar os dados operacionais.
- O login do ADMIN original foi confirmado pelo proprietário antes da publicação; sua senha não foi redefinida nem utilizada nesta verificação de produção.

O advisor não apontou falhas de RLS nesta atualização. Indicou que a proteção do Supabase contra senhas vazadas está desativada: [documentação oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Esse ajuste de Auth depende das opções disponíveis no painel/plano do projeto e não foi alterado automaticamente.

Não foi realizado benchmark de carga massiva: o projeto tinha apenas uma ocorrência operacional. Os indicadores são agregados no banco e respeitam RLS; não há download de milhares de ocorrências para cálculo no navegador.
