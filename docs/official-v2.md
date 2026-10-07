# NC SORTER — atualização oficial V2

Atualização incremental de 06/10/2026 no projeto existente. Nenhum banco, autenticação ou projeto foi recriado.

## Arquivos alterados

- `app/(private)/[...section]/page.tsx`: páginas e restrições de acesso.
- `app/api/[...path]/route.ts`: autorização server-side, registro, filtros, exportação, alertas e histórico.
- `components/shell.tsx`: menus ADMIN/OPERADOR.
- `components/access-request-form.tsx`, `components/operational/access-requests.tsx`, `schemas/access-request.ts`: solicitação pública exclusivamente OPERADOR.
- `components/operational/occurrence-form.tsx`, `occurrence-list.tsx`, `shared.tsx`: canalização digitável e orientação de Outro.
- `components/operational/alerts.tsx`: ativos, histórico, filtros e acompanhamento.
- `components/dashboard/filters.tsx`, `components/operational/dashboard.tsx`: filtros e agrupamentos por texto.
- `lib/domain.ts`, `schemas/index.ts`, `services/occurrences.ts`, `types/database.ts`: contratos, validação e tipos regenerados do banco.
- `tests/official-v2.test.ts`, `tests/access-dashboard.test.ts`: regressões e novo comportamento.
- `db/official-v2.sql`: SQL de referência.
- `supabase/migrations/20261006204402_official_v2_permissions_routing_alerts.sql`: migration incremental aplicada.

## Banco e permissões

- Canalização em texto com trim e limite de 150 caracteres; coluna normalizada gerada e índice para filtros. As 13 ocorrências existentes receberam o nome do cadastro antigo antes da limpeza. FK, tabela e enum legados foram preservados. Trigger exige texto válido em novas gravações.
- ADMIN concentra toda a gestão. OPERADOR registra ocorrências e consulta apenas os cadastros ativos necessários; não lista ocorrências nem acessa gestão, auditoria, dashboard, relatórios ou alertas. Restrições aplicadas nas páginas, API e RLS.
- LIDER existente foi preservado sem promoção automática; tem acesso operacional limitado até promoção explícita por ADMIN.
- Outro criado ativo, sem duplicidade por caixa/espaços, com descrição solicitada e auditoria autenticada.
- Acompanhamento encerra o alerta e remove da lista ativa, mantendo histórico. Quinta ocorrência gera alerta, agrupada pelo occurrenceUser normalizado; período futuro pode gerar novo alerta. Acompanhamento concluído mantém a contagem histórica.
- Ocorrências mostram acesso discreto ao histórico anterior de alertas.

## Limpeza autorizada e preservação

Snapshot local privado antes da manutenção; não incluído no Git. Execução por sessão autenticada do ADMIN primário, com triggers de auditoria ativos. Filtro exato pelo occurrenceUser normalizado, sem LIKE.

| Item | Removidos | Restantes de jpradel |
|---|---:|---:|
| Ocorrências de teste | 7 | 0 |
| Alertas derivados | 2 | 0 |
| Acompanhamentos exclusivos desses alertas | 1 | 0 |

As outras 6 ocorrências foram comparadas integralmente antes/depois da limpeza e preservadas. Todos os 7 perfis permaneceram idênticos. Nenhuma conta foi excluída, promovida, reativada ou teve senha alterada. Auditoria por registro e resumo da manutenção presentes. Dashboard consultado para todo o período: 6 ocorrências.

## Verificação

- `npm test`: 8 testes passaram, zero falhas, incluindo banco PostgreSQL isolado (PGlite).
- `npm run typecheck`: passou com tipos regenerados do Supabase.
- `npm run lint`: passou.
- `npm run build`: passou, compilação de produção e geração das páginas concluídas.
- Integração isolada: criação como OPERADOR; bloqueios RLS; CH01/ch01 agrupados; filtros/exportação; quinta ocorrência; acompanhamento; histórico preservado; novo período; limpeza exata/idempotente; auditoria; promoção de LIDER; proteção do ADMIN primário; recusa de cadastro público LIDER.
- ADMIN real: sessão autenticada validada sem alterar senha; APIs de lookups, dashboard, ocorrências, alertas ativos/histórico, contadores, usuários, solicitações e auditoria retornaram sucesso. Telas de dashboard/gráficos, nova ocorrência, Outro, histórico e relatórios verificadas no navegador.
- OPERADOR: interface e envio exercitados com fixture isolada no navegador, incluindo celular. Banco e RLS exercitados com identidade OPERADOR no teste integrado. Não foi feito login por senha de OPERADOR em produção: todas as antigas contas de teste estavam excluídas; não foram reativadas.
- Advisors: nenhuma nova falha de RLS; aviso existente de proteção contra senhas vazadas desativada. A tabela privada de propriedade permanece sem política pública propositalmente. Índices sem uso em base pequena foram preservados.

Referência do aviso existente: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

A validação de autenticação do ADMIN usou sessão temporária encerrada ao final, não um reset nem conhecimento da senha pessoal.
