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

## 🧠 Arquitetura Moderna (2026)
O ecossistema foi modernizado seguindo os padrões:
- **SDD (Spec Driven Development):** Desenvolvimento guiado por especificações rigorosas ([SDD.md](./SDD.md)).
- **MCP (Model Context Protocol)::** Camada de abstração que padroniza como a IA interage com ferramentas e dados ([ARCHITECTURE.md](./docs/ARCHITECTURE.md)).
- **Enhanced RAG:** Recuperação de contexto orientada a recursos com cache inteligente para alta performance.

## 📂 Estrutura Modular
- **/backend:** Cloudflare Workers + D1. Inclui o **Servidor MCP** interno e lógica de RAG.
- **/frontend:** React + Vite (GitHub Pages). Interface dinâmica que consome a API agnóstica.
- **/bridge:** Conector Node.js para WhatsApp real (Baileys) rodando localmente.
- **/docs:** Documentação técnica e guia de arquitetura.

## 📋 Como Inicializar
O projeto agora é focado em **D1 Remoto** para consistência total.

```bash
# 1. Instalar dependências (Raiz)
npm install

# 2. Configurar o "Cofre"
# Renomeie .env.example para .env e preencha suas chaves.

# 3. Deploy/Sync do Banco (Remoto)
npm run db:deploy

# 4. Rodar Frontend & Backend (Local Sim)
npm run dev:full
```

---
*Transformando agendamentos simples em um ecossistema inteligente de alta performance. 🌐✨*
