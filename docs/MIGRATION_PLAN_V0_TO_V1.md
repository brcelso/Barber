# Plano de Migração V0 -> V1 (Barber App)
**Objetivo:** Evoluir de um sistema Single-User (Barbeiro Solo) para Multi-User (Barbearia com Equipe), garantindo estabilidade e rollback seguro.

---

## 1. Visão Geral da Mudança
A versão **V0** trata cada usuário como uma ilha. A **V1** introduz o conceito de "Organização" (Business) e "Membros" (Staff), onde a agenda e configurações são hierárquicas.

### Impacto Esperado
*   **Alta:** Estrutura de Banco de Dados (Relacionamento User -> Owner).
*   **Média:** Fluxo de Agendamento (Seleção de Profissional).
*   **Crítica:** Robô de WhatsApp (Roteamento de Conversas) e Pagamentos (Split Financeiro).

---

## 2. Estratégia de Deploy & Rollback

### Feature Flags
Todo o código novo será envolvido por uma constante de ambiente ou configuração local:
```javascript
const ENABLE_V1_MARKETPLACE = true; // Controla a ativação da V1
```

### Rollback Plan
1.  **Imediato:** Mudar a flag para `false` e redeploy. O frontend volta a exibir apenas a lista plana de barbeiros.
2.  **Dados:** A coluna `owner_id` no banco é `NULLABLE`. Se o rollback ocorrer, os agendamentos feitos na V1 continuam válidos, mas a visualização hierárquica some.

---

## 3. Checklist de Validação (Antes do Go-Live)

### A. Banco de Dados & Backend
- [ ] Criar migração para adicionar `owner_id` e `business_type` na tabela `users`.
- [ ] Garantir que usuários existentes (V0) fiquem com `owner_id = NULL` (Dono/Solo).
- [ ] Atualizar endpoint `GET /barbers` para suportar filtro hierárquico.
- [ ] Atualizar endpoint de Agendamento para salvar `barber_id` E `shop_id`.

### B. Funcionalidades Críticas (O "Não pode quebrar")
- [ ] **Pagamentos:**
    - [ ] O dinheiro cai na conta do Dono (Shop Admin)? **SIM** (Obrigatório na V1.0).
    - [ ] O split automático para o Barbeiro será implementado? **NÃO** (Manual na V1.0).
- [ ] **Notificações:**
    - [ ] O Dono recebe notificação de *todos* os agendamentos da loja?
    - [ ] O Barbeiro recebe notificação apenas dos *seus*?
- [ ] **Agenda:**
    - [ ] O bloqueio de "Feriado" da Loja afeta a agenda de *todos* os barbeiros?
    - [ ] O bloqueio pessoal do Barbeiro (Almoço) afeta apenas a *sua* agenda?

### C. Robô de WhatsApp (Risco Máximo)
- [ ] **Roteamento V0:** O Robô continuará agendando apenas para o Dono/Loja (Default)?
    - *Mitigação:* Sim. O Robô será "burro" na V1 inicial. Ele agendará na "fila geral" ou para o Dono, e o humano realoca se necessário.
- [ ] **Roteamento V1 (Futuro):** O Robô pergunta "Com quem quer cortar?". (Adiado para V1.1).

### D. Privacidade & Acesso
- [ ] **Staff View:** O login de um membro da equipe (`staff`) esconde:
    - [ ] Faturamento total da loja.
    - [ ] Lista completa de clientes (export).
    - [ ] Configurações críticas da Loja (Preços, Horários de Funcionamento).

---

## 4. Plano de Execução (Passo a Passo)

### Fase 1: Backend & Dados (Oculto)
1.  Rodar Scripts de Banco de Dados.
2.  Atualizar API para aceitar `owner_id` sem quebrar quem manda sem.
3.  Testar integridade dos dados existentes.

### Fase 2: Backoffice do Dono (Admin)
1.  Habilitar tela "Minha Equipe" apenas para admins.
2.  Permitir criação de usuários "Staff" vinculados.
3.  Validar se o Staff criado consegue logar e ver *apenas* sua agenda (vazia).

### Fase 3: Frontend do Cliente (Public)
1.  Ativar `ENABLE_V1_MARKETPLACE = true` em Staging/Dev.
2.  Validar fluxo: Seleção de Loja -> Seleção de Barbeiro -> Agendamento.
3.  Verificar se o agendamento aparece corretamente na agenda do Dono E do Barbeiro.

### Fase 4: Go-Live (Produção)
1.  Deploy em horário de baixo movimento.
2.  Monitorar logs de erro em `POST /appointments`.
3.  Monitorar logs de erro do Robô de WhatsApp.

---

## 5. Plano de Contingência
*   **Cenário A:** Clientes não conseguem agendar com equipe.
    *   *Ação:* Reverter para V0 (Lista Plana). O Dono assume o agendamento manual.
*   **Cenário B:** Robô de WhatsApp trava ou agenda horário duplicado.
    *   *Ação:* Desligar o Robô via Painel Admin (`handleMasterStopBot`) e manter apenas agendamento via App/Site.
*   **Cenário C:** Erro de Pagamento (Dinheiro indo para lugar errado).
    *   *Ação:* Desativar pagamentos online temporariamente, forçar "Pagamento no Local".

---
**Status:** 🟡 Planejamento Concluído. Aguardando Aprovação para Execução da Fase 1.
