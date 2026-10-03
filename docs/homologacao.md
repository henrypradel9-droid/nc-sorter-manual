# Homologação do NC SORTER

Executar apenas em projeto novo autorizado, com usuários e ocorrências claramente identificados como teste. Não misturar testes com a operação real.

1. Criar ADMIN, LIDER e OPERADOR e validar login, logout, refresh de sessão e senha incorreta.
2. Confirmar que solicitação pública aceita apenas OPERADOR/LIDER, que contas pendentes não acessam dados e que a aprovação é exclusiva do ADMIN. Validar separadamente os convites existentes e seus links de definição de senha.
3. Tentar acessar administração e API com OPERADOR. Repetir diretamente pela Data API com JWT de operador: nenhum acesso indevido deve funcionar.
4. Desativar um usuário com sessão aberta. Confirmar recusa imediata das operações protegidas.
5. Cadastrar ocorrência com data/hora manual, usuário novo e cada um dos três status. Recarregar, sair/entrar e consultar em outro navegador.
6. Usar autocomplete sem obrigar uma sugestão. Criar novo erro dentro do formulário e confirmar seleção automática e preservação dos outros campos.
7. Tentar cadastrar “Missort”, “ MISSORT ” e duplicatas de turnos/canalizações. Confirmar erro claro sem novo registro.
8. Conferir busca, filtros combinados, totais e paginação 25/50/100, com mais de 100 registros de teste.
9. Com limite 4, cadastrar quatro ocorrências sem alerta; criar a quinta e a sexta e confirmar um único alerta com contagem 6.
10. Repetir com dois registradores diferentes, variação de maiúsculas e espaços no Usuário. O alerta deve ser do Usuário da ocorrência.
11. Executar duas gravações simultâneas por conexões distintas e confirmar contagem final correta e apenas um alerta.
12. Corrigir usuário/data da ocorrência; conferir recálculo dos períodos antigo e novo. Confirmar que acompanhamentos históricos continuam disponíveis.
13. Alterar o limite e o início do dia operacional. Validar ocorrências imediatamente antes/depois da fronteira e alertas antigos preservados.
14. Abrir alerta, registrar acompanhamento e conferir responsável, instante e auditoria.
15. Comparar dashboard e relatório com uma consulta SQL dos mesmos filtros. Testar CSV com acentos, aspas, ponto e vírgula, quebras de linha e conteúdo iniciado por “=”.
16. Conferir que um segundo editor recebe conflito quando tenta salvar uma versão antiga da ocorrência.
17. Desativar cadastros usados: histórico continua legível, novos registros não aceitam opções inativas.
18. Conferir que atribuição do registrador, timestamps técnicos, versão e logs não podem ser forjados por payload direto.
19. Validar interface em 1440px, 1280px, 768px e 390px; teclado, modais, focus, leitura de tabela e zoom 200%.
20. Executar advisors de segurança/performance no Supabase, revisar planos das consultas e testar o build publicado com HTTPS.

A implantação só está concluída após esses passos no ambiente real, configuração do administrador, canalizações e e-mail transacional.
