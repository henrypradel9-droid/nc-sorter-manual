# Menu restaurado — 07/10/2026

Restaurado o menu compacto anterior, com os ícones e as cores existentes: Dashboard, Nova ocorrência, Todas as ocorrências, Alertas e Relatórios para ADMIN, além dos cadastros e administração. Canalização continua digitável; o cadastro de canalizações não retorna.

ADMIN e OPERADOR continuam como perfis efetivos. OPERADOR pode registrar e consultar suas próprias ocorrências, consultar os alertas e gerenciar sua própria senha. As anotações de acompanhamento, autores dos acompanhamentos, formulário de acompanhamento e auditoria continuam exclusivos do ADMIN. Tipos de erro continuam administrados somente pelo ADMIN.

Proteção aplicada na interface, API e RLS. A API de listagem de alertas do OPERADOR não consulta acompanhamentos. A rota de detalhes dos acompanhamentos é bloqueada, e consultas diretas à tabela retornam zero linhas para OPERADOR. Nenhum dado operacional, perfil ou conta foi alterado; os testes de jpradel continuam excluídos.

Migration: `20261007202413_restore_compact_menu_operator_read.sql`. Altera somente políticas de leitura e a função de filtro; não reinsere nem exclui dados.

Validação: TypeScript, lint, build, teste PostgreSQL isolado de permissões e formulário/canalização, além de revisão de menu ADMIN/OPERADOR em navegador. A revisão usa dados fictícios e não cria ocorrências em produção.

Advisors permanecem com os avisos anteriores, sem novas ocorrências: tabela privada de propriedade propositalmente sem política pública e proteção de senhas vazadas desativada. Referência: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
