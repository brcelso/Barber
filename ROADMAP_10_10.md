# 🎯 Roadmap: Projeto Universal-Scheduler 10/10

Este roteiro define as fases necessárias para transformar o sistema atual em uma plataforma SaaS de alta escala e confiabilidade absoluta.

---

## 🟢 Fase 1: Inteligência & Confiança (Anti-Alucinação)
*Objetivo: Tornar o agendamento à prova de erros.*

- [x] **Implementar Camada RAG**: Criar funções de filtragem dinâmica para injetar apenas serviços/equipe relevantes no prompt (reduzindo ruído).
- [x] **Chain of Thought (CoT)**: Reestruturar o prompt do sistema para exigir que a IA "pense" antes de emitir chamadas de ferramentas.
- [x] **Output Shield (Validação)**: Criar um validador de código que verifica se os IDs de serviços e horários sugeridos pela IA existem no banco D1 antes de confirmar.
- [x] **JSON Mode Enforcement**: Configurar o Agente para operar estritamente via JSON para entradas de ferramentas, eliminando interpretações errôneas.

---

## 🟡 Fase 2: Infraestrutura de Escala (SaaS Ready)
*Objetivo: Suportar milhares de conexões simultâneas.*

- [ ] **Cloudflare Queues integration**: Implementar filas de mensagens entre a Bridge (WhatsApp) e o Backend para processamento assíncrono.
- [ ] **Stateless Bridge Architecture**: Refatorar a Bridge para rodar em containers isolados com persistência de sessão em Redis ou Cloudflare R2.
- [ ] **Otimização de Banco D1**: Implementar índices compostos por `tenant_id` (ou e-mail do dono) para garantir consultas rápidas em multitenancy massivo.
- [ ] **Circuit Breaker**: Implementar proteção para que falhas em uma API externa (ex: Mercado Pago ou Bridge específica) não afetem o ecossistema inteiro.

---

## 🔵 Fase 3: Maturidade de Produto (Commercial Grade)
*Objetivo: Facilidade de uso e automação de vendas.*

- [ ] **Dashboard Self-Service**: Painel administrativo para os donos de negócios configurarem Agenda, Equipe e Tom de Voz sem auxílio técnico.
- [ ] **Sistema de Assinaturas (Webhook Mercado Pago)**: Automação completa do ciclo de vida da conta (bloqueio automático após expiração).
- [ ] **Telemetria de Conversas**: Criar uma log de "Health" das conversas para identificar onde o bot está falhando ou perdendo vendas.
- [ ] **Multi-Agent Routing**: Implementar diferentes agentes para diferentes intenções (Apoio ao Cliente vs. Agendamento Técnico).

---

## 🔴 Fase 4: Experiência Premium
*Objetivo: WOW Moment para o usuário final.*

- [ ] **Resumo de Agenda Matinal**: Envio automático de briefing diário para o dono via WhatsApp (Cron + AI).
- [ ] **Lembretes de Pagamento Ativos**: IA monitorando agendamentos pendentes e cobrando o cliente de forma amigável.
- [ ] **Suporte a Multi-idiomas/Localidades**: Preparar o sistema para expansão internacional (Timezones e Moedas).

---

### Como ler este documento?
- **Prioridade 1 (Imediata)**: Fase 1 (Confiança é tudo no agendamento).
- **Prioridade 2 (Escala)**: Fase 2 (Não adianta vender se o sistema não aguentar).
- **Prioridade 3 (Vendas)**: Fase 3 e 4 (Crescimento e retenção).
