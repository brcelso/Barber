# ✂️ Barber - Premium Booking & Management System

Barber é um ecossistema completo para gestão de barbearias de alto padrão. Combinando uma interface premium com tecnologia de ponta, o sistema automatiza desde o agendamento inicial via Web ou WhatsApp até a gestão financeira e notificações via bridge.

![Design System](https://img.shields.io/badge/Design-Premium_Gold-d4af37)
![Cloudflare](https://img.shields.io/badge/Backend-Cloudflare_Workers-f38020)
![MercadoPago](https://img.shields.io/badge/Payments-Mercado_Pago-009ee3)
![Architecture](https://img.shields.io/badge/Architecture-Modular_React-61dafb)

## 🚀 Funcionalidades Principais

### 🙍‍♂️ Experiência do Cliente
- **Login Híbrido:** Autenticação via Google One-Tap ou login manual simplificado (E-mail/WhatsApp).
- **Multi-Barbeiros:** Escolha o profissional de sua preferência com visualização de fotos e disponibilidade.
- **Agendamento Inteligente:** Seleção de serviços com preços dinâmicos, calendário interativo e slots de horários em tempo real.
- **Histórico Unificado:** Acompanhe status de agendamentos, pagamentos pendentes e reagendamentos.

### ✂️ Painel do Barbeiro & Admin (Modular)
- **Agenda em Tempo Real:** Bloqueio de horários (individual ou bulk), confirmação manual/automática e edição de agendamentos.
- **Gestão de Equipe:** Adição e recrutamento de novos barbeiros para a banca.
- **Configuração de IA:** Personalização total do tom de voz e mensagens do robô de WhatsApp.
- **Painel Master:** Visão administrativa global para o proprietário gerir todos os usuários e licenças.
- **Sistema de Licenciamento:** Gestão de planos (Trial, Pro, Business) com integração Mercado Pago.

### 🤖 Automação & IA (WhatsApp Bridge)
- **WhatsApp Bot:** Assistente virtual inteligente (Llama 3.1) que realiza agendamentos, responde dúvidas e consulta horários via linguagem natural.
- **Notificações Automáticas:** Envio programado de confirmações e lembretes para reduzir o "no-show".

## 📂 Estrutura do Projeto (Refatorado v2)

O projeto segue uma arquitetura modular focada em escalabilidade e manutenção:

### 💻 Frontend (`/frontend`)
Arquitetura baseada em Componentes Reutilizáveis e Páginas de Visão Única.
- **`src/services/api.js`**: Única fonte de verdade para todas as chamadas HTTP (Consolidado).
- **`src/pages/`**: Divisão por contextos (`Booking`, `History`, `AdminPanel`).
- **`src/components/`**: UI isolada (`Header`, `LoginScreen`, `ActionSheet`, `Modals`).
- **`src/pages/Admin/Tabs/`**: Sub-módulos do painel administrativo para carregamento focado.

### ☁️ Backend (`/backend`)
Serverless rodando em Cloudflare Workers.
- **`src/index.js`**: Roteador principal modularizado.
- **`src/api/`**: Handlers específicos para Admin, Master, Appointments e Pagamentos.
- **`src/whatsapp.js`**: Lógica de webhooks e integração externa isolada.

### 🌉 Bridge (`/bridge`)
Serviço Node.js responsável pela conexão via socket com o WhatsApp real.

## 🛠️ Stack Tecnológica

- **Frontend:** React + Vite, Lucide Icons, Date-fns.
- **UI/UX:** Vanilla CSS (Glassmorphism), Design System Premium (Gold & Dark Mode).
- **Backend:** Cloudflare Workers (Serverless) + Cloudflare D1 (SQL).
- **IA:** Cloudflare AI (Llama 3.1) para processamento de linguagem natural.
- **Payments:** SDK Mercado Pago (API de Preferências e Webhooks).

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
- **Proteção de Rotas:** Autenticação via headers personalizados e tokens de ambiente seguros.
- **Auto-Healing:** Gerenciador de processos que monitora e reinicia o robô em caso de queda.

---
*Desenvolvido para oferecer a melhor experiência entre barbeiro e cliente. ✂️✨*
