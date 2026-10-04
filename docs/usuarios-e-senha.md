# Usuários e senha — 04/10/2026

- Mínimo de senha reduzido de 12 para 8 caracteres no cadastro e em Minha conta, com validação no servidor. Máximo de 128 preservado; cadastro continua exigindo maiúscula, minúscula e número. Nenhuma senha existente foi alterada.
- A aba Usuários agrupa nome/e-mail e apresenta perfil, situação e ações. O primeiro ADMIN recebe o selo **ADMIN primário**.
- Somente o ADMIN primário vê a lixeira e pode executar `DELETE /api/users`. A confirmação exige digitar o e-mail da pessoa.
- Exclusão lógica do acesso: a pessoa sai da lista, fica inativa e não pode ser reativada pela aplicação. Ocorrências, referências ao perfil e auditoria permanecem. A identidade no Supabase Auth não é apagada fisicamente; o bloqueio operacional é verificado pelo perfil ativo em cada requisição e pelas políticas do banco, inclusive para sessões já abertas.
- Identidade do primário fixada pelo primeiro perfil existente, em tabela privada sem permissão de alteração por clientes. A conta primária não pode ser excluída, desativada ou perder seu perfil ADMIN.
- RPC de exclusão exige o primário autenticado, bloqueia a linha durante a operação e registra `USER_DELETED`. Repetições não duplicam essa auditoria. Alteração direta das colunas de exclusão e restauração de acesso excluído são bloqueadas.

Migration incremental: `20261004171020_primary_admin_user_deletion.sql`. Aplicada sem excluir pessoas: após a mudança, seis perfis e sete ocorrências permaneciam, com zero perfis excluídos e o primeiro ADMIN ativo.

## Verificação

Sete testes passaram, cobrindo senha com 8/7/128/129 caracteres, papéis permitidos, bloqueio de ADMIN secundário/OPERADOR/LIDER/anônimo, proteção da identidade primária, confirmação por e-mail, repetição, preservação das ocorrências e bloqueio de sessões do excluído. A suíte anterior de cadastro, aprovação, RLS, auditoria e dashboard continuou passando.

Navegador: tela desktop/celular, lixeira somente para o primário, ausência da lixeira no próprio primário, confirmação obrigatória, retirada da linha após exclusão, ADMIN secundário sem lixeira e mínimo 8 nos formulários. Essas verificações usaram exclusivamente dados interceptados no navegador local; nenhuma pessoa real foi excluída.

O advisor informa [RLS sem política](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) na tabela privada de propriedade: é intencional, pois nenhum cliente deve acessá-la diretamente. Continua o aviso já existente de [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Nenhuma permissão pública nova foi concedida.
