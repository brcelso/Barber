# ✂️ Barber - Premium Booking & Management System

Barber é um ecossistema completo para gestão de barbearias de alto padrão. Combinando uma interface premium com tecnologia de ponta, o sistema automatiza desde o agendamento inicial via Web ou WhatsApp até a gestão financeira e notificações via bridge.

![Design System](https://img.shields.io/badge/Design-Premium_Gold-d4af37)
![Cloudflare](https://img.shields.io/badge/Backend-Cloudflare_Workers-f38020)
![MercadoPago](https://img.shields.io/badge/Payments-Mercado_Pago-009ee3)

## 🚀 Funcionalidades Principais

### 🙍‍♂️ Experiência do Cliente
- **Login Híbrido:** Autenticação via Google One-Tap ou login manual simplificado (E-mail/WhatsApp).
- **Multi-Barbeiros:** Escolha o profissional de sua preferência com visualização de fotos e disponibilidade.
- **Agendamento Inteligente:** Seleção de serviços com preços dinâmicos, calendário interativo e slots de horários em tempo real.
- **Histórico Unificado:** Acompanhe status de agendamentos, pagamentos pendentes e reagendamentos.
- **Pagamento Integrado:** Integração com Mercado Pago para confirmação instantânea de vaga.

### ✂️ Painel do Barbeiro & Admin
- **Gestão de Agenda Total:**
  - Bloqueio de horários específicos ou dias inteiros (Bulk Toggle).
  - Confirmação manual ou automática de horários.
  - Edição e reagendamento de clientes diretamente pelo painel.
- **Histórico 360º:** Visão unificada que mostra tanto seus compromissos profissionais quanto seus agendamentos pessoais como cliente.
- **Sistema de Licenciamento:** Gestão de assinatura (trial de 3 dias e planos mensais) via Mercado Pago.
- **Atendimento WhatsApp:** Botão flutuante para contato direto e bridge de notificações.

### 🤖 Automação & IA (WhatsApp Bridge)
- **WhatsApp Bot:** Assistente virtual inteligente integrado (Llama 3.1) que:
  - Responde dúvidas sobre serviços e preços.
  - Realiza agendamentos diretamente pela conversa.
  - Consulta e cancela horários via comandos naturais.
- **Notificações Automáticas:** Envio de mensagens de confirmação, lembretes e cancelamentos via WhatsApp através de um Bridge dedicado.

## 🛠️ Stack Tecnológica

- **Frontend:** React + Vite, Lucide Icons, Date-fns.
- **UI/UX:** Vanilla CSS com Glassmorphism, Design System Premium (Gold & Dark Mode).
- **Backend:** Cloudflare Workers (Serverless).
- **Database:** Cloudflare D1 (SQL relacional de alta performance).
- **Inteligência Artificial:** Cloudflare AI (Llama 3.1) para o Bot de WhatsApp.
- **Integrações:** Mercado Pago (API de Preferências e Webhooks).

## 📋 Como Inicializar

### 1. Requisitos
- Node.js v18+
- Wrangler CLI (`npm install -g wrangler`)

### 2. Configuração Local
```bash
# Clone e instalação
git clone https://github.com/brcelso/Barber.git
cd Barber
npm install

# Inicializar DB local (D1)
npm run db:init
```

### 3. Execução
```bash
# Rodar Frontend e Backend simultaneamente
npm run dev:full
```

## 🔒 Segurança e Regras de Negócio
- **Validação de Assinatura:** O Bridge de WhatsApp e funcionalidades Admin exigem licença ativa.
- **CORS & Headers:** Proteção de rotas via cabeçalhos de autenticação personalizados.
- **Webhooks Seguros:** Processamento de pagamentos e mensagens validado via tokens de ambiente.

## 🆘 Recuperação de Desastre
Caso precise reinstalar o projeto em uma nova máquina, consulte o arquivo `.env.example` na raiz para ver todas as variáveis de ambiente necessárias.
**Itens Críticos para Backup:**
1. **Credenciais Cloudflare:** API Token e ID do Banco D1.
2. **Pasta `wa-bridge/auth_sessions`:** Contém a sessão conectada do WhatsApp (evita novo QR Code).
3. **Ngrok AuthToken:** Para manter o túnel estável.

## 🤖 Controle do Robô (Novidade)
- **Parada Suave:** Botões de "Parar" no painel desconectam o WhatsApp mas mantêm o servidor local ativo.
- **Auto-Healing:** O gerenciador local reinicia automaticamente o processo caso o WhatsApp trave.
- **Notificações de Status:** Admin recebe avisos no próprio WhatsApp ao ligar/desligar o robô.

---
*Desenvolvido para oferecer a melhor experiência entre barbeiro e cliente. ✂️✨*
