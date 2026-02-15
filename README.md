# Barber - Premium Booking System

Barber é um aplicativo de agendamento para barbearias, desenvolvido no mesmo formato do **Leca**. Possui interface premium com glassmorphism, agendamento em tempo real, integração com gateway de pagamento (Mercado Pago) e banco de dados local para performance superior.

## 🚀 Tecnologias

- **Frontend:** React + Vite + Lucide Icons
- **Styling:** CSS Moderno (Vanilla) com Design System Premium
- **Database:** Dexie (Local) + Cloudflare D1 (Cloud)
- **Backend:** Cloudflare Workers
- **Pagamentos:** Mercado Pago (Placeholder Integrado)

## 🛠️ Como rodar

### 1. Instalação
```bash
cd Barber
npm install
```

### 2. Inicializar Banco de Dados (Local)
Certifique-se de ter o [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) instalado.
```bash
npm run db:init
```

### 3. Rodar em Desenvolvimento
Para rodar tanto o frontend quanto o servidor localmente:
```bash
npm run dev:full
```

## 📋 Funcionalidades

- [x] Login com Google (Mock)
- [x] Seleção de Serviços com preços dinâmicos
- [x] Calendário interativo para escolha de data
- [x] Slots de horários disponíveis
- [x] Checkout transparente com Mercado Pago
- [x] Histórico de agendamentos do cliente
- [x] Painel Admin (Visualização de todos os cortes)

## 🎨 Design

O design segue a estética "Enterprise/Premium" com:
- Paleta em Tons de Preto e Ouro (Gold)
- Efeitos de Blur e Transparência (Glassmorphism)
- Animações suaves de entrada (Fade-in)
- Totalmente Responsivo (PWA Ready)
