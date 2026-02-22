# 🌐 Universal Scheduler Ecosystem - Multi-Niche SaaS

O **Universal Scheduler Ecosystem** é uma plataforma SaaS (Software as a Service) de agendamentos e gestão 100% agnóstica a nichos. O que antes era focado apenas em barbearias, agora é um motor potente capaz de gerir **Pet shops, Clínicas, Salões de Beleza, Estúdios de Tatuagem** e qualquer negócio baseado em agendamento de serviços.

![Version](https://img.shields.io/badge/Version-2.0_Multi--Niche-blueviolet)
![Design System](https://img.shields.io/badge/Design-Premium_Dynamic-d4af37)
![Cloudflare](https://img.shields.io/badge/Backend-Cloudflare_Workers-f38020)
![AI](https://img.shields.io/badge/AI-Llama_3.1-black)

## 🚀 Evolução Multi-Nicho
O sistema agora se adapta dinamicamente ao `business_type` definido no banco de dados.

- **IA Camaleão:** O assistente virtual (WhatsApp) detecta o tipo de negócio e ajusta tom de voz, termos técnicos (ex: de "Cortar Cabelo" para "Banho e Tosa") e emojis.
- **Terminologia Universal:** Todo o sistema fala em "Profissionais", "Prestadores" e "Unidades de Negócio", tornando a interface amigável para qualquer nicho.
- **Design Inteligente:** Ícones e notificações se adaptam (✂️, 🐾, 🏥, 🗓️) conforme o estabelecimento cadastrado.

## 🙍‍♂️ Experiência do Cliente (B2C)
- **Agendamento Multitenant:** Escolha o profissional e o serviço com visualização de horários ocupados em tempo real.
- **Login Universal:** Google One-Tap para uma experiência de agendamento em segundos.
- **Histórico e Reagendamento:** Gestão total de horários via WebApp.

## 💼 Painel de Gestão (B2B)
- **Controle Total da Unidade:** Bloqueio de slots, gestão de equipe e catálogo de serviços.
- **Configuração de IA:** Ajuste fino de como o robô deve atender seus clientes no WhatsApp.
- **SaaS Master:** Painel exclusivo para o proprietário do ecossistema monitorar estatísticas globais, usuários e licenças ativas.

## 🤖 Automação via WhatsApp
- **Atendimento 24/7:** A IA processa agendamentos em linguagem natural diretamente pelo WhatsApp.
- **Redução de No-Show:** Notificações automáticas de confirmação e lembretes configuráveis.

## 📂 Estrutura Modular
- **/backend:** Cloudflare Workers + D1. Inclui **Auto-Migração de Banco**, garantindo que novas colunas sejam criadas automaticamente no deploy.
- **/frontend:** React + Vite (GitHub Pages). Interface dinâmica que consome a API agnóstica.
- **/bridge:** Conector Node.js para WhatsApp real (Baileys).

## 🛠️ Deploy & CI/CD
O projeto está configurado com **GitHub Actions**:
1. **Frontend:** Deploy automático para GitHub Pages ao dar push na `main`.
2. **Backend:** Deploy serverless para Cloudflare Workers.

## 📋 Como Inicializar
```bash
# Instalar dependências
npm install

# Inicializar Banco D1 (Local)
npm run db:init

# Rodar Ecossistema Completo
npm run dev:full
```

---
*Transformando agendamentos simples em um ecossistema inteligente de alta performance. 🌐✨*
