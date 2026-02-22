# 🚀 Simulação de Ecossistema: Experiência Premium Zero Intervenção

O **Universal Scheduler** não é apenas um sistema de agendamento; é um motor autônomo de vendas e gestão. Esta simulação demonstra como um negócio é criado e operado sem qualquer intervenção humana manual.

---

## �️ Fase 1: Ativação Instantânea (Master Simulation)

Para novos parceiros "High-Ticket" ou demonstrações rápidas, o Administrador Master pode ativar um negócio completo em **menos de 3 segundos**.

**Ação:** Chamada para `/api/master/simulate-onboarding`
**O que o sistema faz instantaneamente:**
1.  **Perfil Admin:** Cria o usuário com plano **Pro** ativo por 1 ano.
2.  **Configuração de Nicho:** Define o tipo de negócio (ex: Barbearia) e o nome da loja.
3.  **Catálogo IA:** Popula automaticamente os serviços (Corte, Barba, Combo) com preços e durações.
4.  **Disponibilidade:** Define horários padrão (Seg-Sex, 08h-18h).
5.  **Fintech Ready:** Configura um token de teste do **Mercado Pago** para o lojista receber pagamentos diretos.
6.  **Bot Ativo:** Sincroniza o robô "Leo" com status "Conectado".

---

## 💬 Fase 2: O Atendimento Autônomo (Lado do Cliente)

Uma vez ativo, o Agente IA assume o controle total do WhatsApp.

**Cenário:** Um novo cliente (nunca visto pelo sistema) envia uma mensagem.

**Ação:**
> **Cliente:** "Oi, quero agendar um Corte Social para amanhã às 14h."

**O que o sistema faz:**
1.  **Onboarding Silencioso:** O sistema detecta que o número é novo e cria automaticamente um perfil **Guest** (`guest_5511...`) para evitar falhas de banco de dados.
2.  **Processamento Cognitivo:** O Agente IA lê a mensagem, entende a intenção e utiliza as ferramentas:
    *   `consultar_agenda`: Verifica se "Amanhã às 14h" está livre.
    *   `agendar_cliente`: Cria o agendamento usando o **ID exato** do serviço extraído anteriormente.
3.  **Resposta da IA:**
    > "Com certeza! Seu Corte Social foi agendado para amanhã às 14:00. Vou te enviar o link para o pagamento abaixo."

---

## � Fase 3: Pagamento Direto ao Lojista (Split Automático)

Diferente de sistemas comuns, o Universal Scheduler integra a carteira do lojista.

1.  **Geração do Link:** O sistema utiliza o `mp_access_token` cadastrado especificamente para aquele profissional.
2.  **Autonomia Financeira:** O dinheiro do agendamento cai **diretamente na conta do lojista**, sem passar por intermediários manuais.
3.  **Confirmação via Webhook:** Assim que o pagamento é aprovado, o sistema:
    *   Muda o status do agendamento para `confirmed`.
    *   Envia uma notificação automática via WhatsApp para o cliente e para o lojista.

---

## 👨‍💼 Fase 4: Gestão do Negócio via Voz/Texto (IA Admin)

O dono do negócio não precisa de um painel complexo. Ele gerencia tudo falando com o Agente.

**Ação:**
> **Dono:** "Leo, mude meu preço do corte para 50 reais e atualize meu token do Mercado Pago para [NOVO_TOKEN]."

**O que a IA faz:**
1.  **Identificação de Intenção:** Reconhece comandos administrativos.
2.  **Execução de Ferramentas:**
    *   `gerenciar_servicos`: Atualiza o preço no catálogo.
    *   `gerenciar_configuracoes`: Atualiza o Access Token do Mercado Pago e outras variáveis de ambiente do negócio.
3.  **Confirmação:**
    > "Tudo pronto, Chefe! O preço foi atualizado e as novas configurações de pagamento já estão valendo."

---

## 📊 Vantagens da Arquitetura Universal
- **Zero Atrito:** Clientes e Profissionais não precisam criar contas complexas; a IA cuida da persistência.
- **Multitenancy Real:** Cada unidade opera como uma ilha independente com suas próprias regras e finanças.
- **Escalabilidade:** Um único servidor pode gerenciar milhares de "Leos" atendendo simultaneamente.

---

### ✅ Check-list de Funcionalidades Ativas
- [x] Onboarding automatizado via API Master.
- [x] Extração de serviços via LLM.
- [x] Criação automática de perfis de clientes (Guest).
- [x] Agendamento inteligente com validação de horário.
- [x] Integração dinâmica de Mercado Pago por lojista.
- [x] Gestão de configurações do estabelecimento via IA.
- [x] Notificações automáticas via Bridge WhatsApp.
