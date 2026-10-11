# Recuperação de acesso sem e-mail

Na aba **Usuários**, administradores autorizados usam o botão com a chave para gerar uma senha temporária. É necessário confirmar o e-mail da conta ativa. A senha aparece uma única vez e deve ser entregue diretamente à pessoa. Ela vale por 24 horas; no primeiro acesso é obrigatório escolher uma senha pessoal de pelo menos oito caracteres.

Todas as contas administrativas aparecem como **ADMIN**. A permissão adicional de gerenciamento fica em `private.account_admins`, sem depender de metadados editáveis. Essas contas são protegidas contra exclusão, desativação e remoção do perfil ADMIN. A identidade original em `private.app_ownership` continua imutável. Somente o proprietário original pode conceder a permissão adicional por RPC; não há concessão pública nem automática ao promover alguém a ADMIN.

## Implantação

Aplicar `supabase/migrations/20261011131201_account_admin_password_recovery.sql` antes de publicar o aplicativo. A migration não redefine senhas, não promove usuários adicionais e não altera registros operacionais. A concessão a uma pessoa é uma ação autenticada e auditada separada.

O servidor usa a chave secreta já configurada para `auth.admin.updateUserById`. Ela nunca é enviada ao navegador. A senha temporária é gerada com `node:crypto`; não é gravada na auditoria nem no armazenamento do navegador. A API responde com `Cache-Control: private, no-store`.

## Proteções e falhas

- A solicitação bloqueia o acesso antes de alterar a senha no Auth. A finalização é exclusiva do servidor. Uma falha intermediária mantém o bloqueio; um administrador autorizado pode tentar novamente após cinco minutos.
- A troca obrigatória e o vencimento são verificados no servidor e nas políticas de dados por `private.current_role()`. Enquanto a troca está pendente, somente a tela da conta e a saída ficam disponíveis.
- Sessões criadas antes da finalização não recuperam acesso mesmo depois da troca. A validação consulta o identificador da sessão em `auth.sessions`.
- A conclusão verifica a mudança do hash do Auth sem expor esse hash. A senha temporária não pode ser reutilizada como senha pessoal.
- Contas inativas ou excluídas não podem ser recuperadas por esse botão. A exclusão de usuários comuns continua lógica, preservando histórico e auditoria.

Os avisos informativos de RLS sem políticas nas tabelas privadas são intencionais: o acesso direto é negado. A opção de proteção contra senhas vazadas do Supabase é independente desta funcionalidade e não é alterada pela migration.

## Verificação

`npm test` cobre delegação, negação a ADMIN comum e OPERADOR, proteção das contas, confirmação de e-mail, finalização exclusiva do servidor, bloqueio de sessões antigas, expiração e troca obrigatória. Executar também lint, TypeScript, build e conferir as telas no navegador.
