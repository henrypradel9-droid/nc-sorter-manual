# NC SORTER

Aplicação independente para registro manual e acompanhamento de ocorrências de sorting. Não usa APIs corporativas nem planilhas como banco. Supabase/PostgreSQL é a fonte de dados; não há modo de produção com dados simulados.

## Estado da entrega

Atualização de 02/10/2026: solicitações públicas de OPERADOR/LIDER com aprovação obrigatória do ADMIN, auditoria e novo dashboard agregado. Veja `docs/atualizacao-acesso-dashboard.md` para arquivos, migration, rotas, segurança, testes e limites. Acesse `/solicitar-acesso` para solicitar uma conta e `/administracao/solicitacoes` como ADMIN para analisá-la. O login usa o e-mail e a senha cadastrados; aprovação não exige SMTP. O primeiro ADMIN permanece inalterado.

O projeto exclusivo NC SORTER foi criado na organização autorizada, região São Paulo, com schema aplicado e conexão configurada. O primeiro ADMIN foi criado para jamslyhen.pradel@mercadolivre.com. Login real e consultas autenticadas de perfil, catálogos, painel, ocorrências, alertas, configurações e usuários passaram. Nenhum banco de outro projeto foi alterado. A senha inicial está em um arquivo local separado do pacote; altere-a em Minha conta.

A validação local usa PostgreSQL em PGlite para SQL, gatilhos e RLS. Supabase Auth e consultas PostgREST também foram verificados no projeto real, sem inserir ocorrências fictícias. Permanecem pendentes a homologação operacional com dados reais, testes de gravações concorrentes, configuração de e-mail/convites e publicação. Cadastre as canalizações reais antes da primeira ocorrência.

## Stack

Next.js 16.3.4, React 19.2.6, TypeScript, Tailwind CSS, componentes shadcn/ui, Zod, Recharts, Lucide e Supabase (`supabase-js` 2.117.2 e `ssr` 0.12.7). Runtime Node.js 22.13+; desenvolvimento validado com Node.js 24.20.0. O lockfile deve ser preservado. Não há Prisma nem dependência de D1 no fluxo de dados.

A estrutura visual inicial veio do starter Sites; a execução desta entrega usa Next.js estável. Publicação ainda não realizada. Um deploy Next.js com servidor Node pode usar os scripts abaixo; eventual publicação em Sites precisa de adaptação e verificação do runtime, sem trocar a fonte Supabase.

## Execução local

1. Execute `npm ci` na pasta do projeto.
2. Copie `.env.example` para `.env.local`.
3. Configure as variáveis do NOVO projeto Supabase, depois da autorização do proprietário.
4. Execute `npm run dev`.
5. Abra `http://127.0.0.1:3107`.

Sem variáveis Supabase, `/login` mostra explicitamente que o ambiente está em preparação. Não existe senha padrão.

### Variáveis

- `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto novo.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: chave publicável do mesmo projeto.
- `SUPABASE_SECRET_KEY`: chave administrativa, somente no servidor; necessária para convites.
- `APP_ORIGIN`: origem exata do site, por exemplo `http://127.0.0.1:3107`. É validada em toda mutação para proteção contra CSRF.
- `NEXT_PUBLIC_OFFICIAL_LOGO_URL`: opcional; caminho de um asset oficial autorizado colocado em `public/`. Sem esse arquivo, é usado apenas o nome NC SORTER e um ícone genérico de caixas, sem imitação da marca.

Nunca versionar `.env.local`, chaves privadas ou senhas.

## Banco e implantação inicial

1. Obter autorização explícita para acessar a conta.
2. O proprietário escolhe a organização. Consultar e confirmar os custos antes de criar o projeto.
3. Criar um projeto exclusivo NC SORTER, preferencialmente na região São Paulo (`sa-east-1`). Não executar o schema em outro banco.
4. `db/schema.sql` contém o schema inicial revisável; a migration inicial foi aplicada como `20261001220316_nc_sorter_initial_schema` e está espelhada em `supabase/migrations/`. Na implantação, gerar o arquivo de migration com `supabase migration new`, seguindo a ajuda da versão instalada, e usar esse SQL no projeto novo.
5. Aplicar a migration de forma transacional, executar os advisors do Supabase e validar RLS com usuários de teste.
6. Desabilitar cadastro público; criar o primeiro usuário de Auth e seu perfil ADMIN por uma operação administrativa controlada. O bootstrap requer o UUID real de Auth, nome e e-mail fornecidos pelo proprietário. Não há autoatribuição de ADMIN nem bootstrap exposto por HTTP.
7. Para o bootstrap via SQL administrativo, definir `request.jwt.claim.sub` com o UUID desse usuário durante a transação, inserir seu perfil ADMIN ativo e encerrar a transação. O gatilho de auditoria usa esse ator. Não desabilitar gatilhos ou RLS.
8. Configurar URL do site e URLs permitidas no Supabase Auth. Para convites, configurar o template de e-mail com `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`; a rota verifica o token no servidor e encaminha para definir senha em `/conta`. Configurar SMTP real e testar entrega e expiração.
9. Cadastrar as canalizações reais. Os seis tipos de erro pedidos e T1/T2/T3 são dados iniciais; não existem ocorrências ou canalizações fictícias em produção.
10. Executar o roteiro de homologação antes de liberar usuários reais.

## Perfis e autorização

- ADMIN: administração completa, configurações, usuários e auditoria.
- LIDER: ocorrências, alterações, relatórios, alertas e cadastros operacionais.
- OPERADOR: registra ocorrências e consulta somente os próprios registros. Essa restrição foi adotada como padrão conservador para “informações permitidas”.

A API valida a identidade com Supabase Auth e consulta o perfil ativo no banco a cada requisição. RLS e privilégios de coluna replicam a proteção no PostgreSQL. Bloquear um perfil impede novas leituras e gravações mesmo com JWT ainda válido. Nenhuma role recebida do navegador é usada como autorização. `user_metadata` não define permissões.

## Regras da operação

- `occurrence_user` é livre; `registered_by_user_id` sempre vem da identidade autenticada.
- A comparação de usuários e nomes de cadastros usa `lower(btrim(...))` no banco. A forma digitada é preservada para apresentação da ocorrência.
- Qualquer um dos três status pode ser escolhido no cadastro. Não existe fluxo obrigatório nem campo de fechamento.
- O limite padrão é 4: a 5ª ocorrência do mesmo usuário normalizado no dia operacional gera alerta.
- O dia usa America/Sao_Paulo, com hora inicial configurável. A arquitetura separa cálculo e limites do período; modos por turno ou janela móvel ainda não estão expostos nesta implementação.
- Uma chave única `(occurrence_user, period_start, period_end)` e upsert mantêm um alerta por período. Gravações e alterações de configuração compartilham bloqueio transacional para consistência.
- Alterações recalculam os períodos afetados. Se a contagem cair, o alerta fica inativo, preservando seus acompanhamentos. Alterar a configuração recalcula os grupos existentes.
- Ocorrências usam UUID estável durante o envio para tolerar repetição. Edições exigem `version` e detectam alterações concorrentes.
- A central filtra e pagina no banco em 25/50/100 registros. A atualização ocorre a cada 30 segundos enquanto a aba está visível.
- A exportação CSV usa os mesmos filtros e uma consulta consistente. Limite explícito de 20.000 registros por exportação; acima disso, o usuário deve restringir o período. Células que poderiam ser interpretadas como fórmulas são neutralizadas.
- Tipos de erro, turnos e canalizações são desativados, não excluídos. O histórico continua exibindo seus nomes.

## Auditoria

Gatilhos registram ator autenticado, entidade, ID, instante técnico e objetos anterior/novo. Logs não podem ser alterados pelas roles da aplicação. ADMIN consulta a auditoria completa; os detalhes de ocorrências mostram o histórico permitido pela mesma RLS. A tela de detalhes exibe as últimas 100 alterações; a auditoria administrativa tem paginação.

## Scripts

- `npm run dev`: servidor de desenvolvimento, porta 3107.
- `npm run typecheck`: TypeScript sem emissão.
- `npm run lint`: ESLint.
- `npm test`: regras de domínio e integração PostgreSQL local.
- `npm run build`: build de produção Next.js.
- `npm start`: servidor do build de produção, porta 3107.

## Estrutura

- `app/`: rotas, login, shell protegido e APIs.
- `components/operational/`: formulário, central, dashboard, alertas, relatórios e administração.
- `components/ui/`: primitivas acessíveis shadcn/ui.
- `lib/`: identidade, autorização, Supabase e tipos de domínio.
- `schemas/`: validações Zod.
- `services/`: consultas filtradas.
- `db/schema.sql`: definição inicial do PostgreSQL, aplicada no projeto novo; migrations registradas em `supabase/migrations/`.
- `tests/`: dados explicitamente fictícios somente para testes locais.
- `docs/homologacao.md`: validação necessária no ambiente real.

## Limites de validação

O teste PGlite cobre RLS, permissões, normalização, alerta na 5ª/6ª, correções, acompanhamentos, cadastros, consulta agregada, auditoria e usuários inativos. Conexões simultâneas reais, login, cookie refresh, PostgREST, convites, recuperação e persistência entre dispositivos ainda precisam ser verificados no novo Supabase. A tela de login respondeu HTTP 200 e foi conferida visualmente em desktop (1440px) e mobile (390px). As telas autenticadas ainda aguardam a criação do ADMIN.

## Projeto Supabase

- Projeto: `uhjwpueaxjeczzxxxovd` — NC SORTER.
- Região: São Paulo (`sa-east-1`).
- Dashboard: https://supabase.com/dashboard/project/uhjwpueaxjeczzxxxovd
- Advisor de segurança após a migration: sem apontamentos.
- Advisor de performance: índices sem uso, informativo em banco novo sem ocorrências. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index
- Acesso anônimo a ocorrências e dashboard: bloqueado em teste na API real.
