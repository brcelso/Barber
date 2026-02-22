# 🚀 Simulação de Onboarding: Experiência Premium sem Intervenção Humana

Esta simulação demonstra o fluxo completo de um novo profissional (ex: Barbeiro) entrando no ecossistema **Universal Scheduler**.

---

### 📱 1. O Início (Mensagem Inicial)
**Usuário:** "Quero me cadastrar" or "Cadastro"
**IA:** 
> 👋 Olá! Vi que você tem interesse em profissionalizar seu negócio com nosso Agente Inteligente.
> 
> Para começar, qual é o seu ramo de atuação?
> 
> 1️⃣ - Barbearia 💈
> 2️⃣ - Pet Shop 🐾
> 3️⃣ - Salão de Beleza 💅
> 4️⃣ - Clínica 🏥
> 5️⃣ - Outro 📅

---

### 🎯 2. Definição do Nicho e Plano
**Usuário:** "1"
**IA:**
> Ótima escolha! Atenderemos muito bem o seu barbearia. 💈
> 
> Agora, escolha o plano que melhor se adapta ao seu momento:
> 
> 1️⃣ - *Individual* (R$ 49/mês): Ideal para quem trabalha sozinho.
> 2️⃣ - *Standard* (R$ 99/mês): Para pequenas equipes (até 3 pessoas).
> 3️⃣ - *Pro* (R$ 199/mês): Equipe ilimitada e recursos avançados.

**Usuário:** "2"
**IA (Pensamento):** *Salvando plano Standard e mudando estado para reg_awaiting_services.*

---

### ✂️ 3. Cadastro de Serviços (Poder da IA)
**AI:**
> Perfeito! Agora, me diga quais os principais serviços que você oferece (ex: Corte de Cabelo R$ 50, Barba R$ 30).
> 
> Você pode digitar um por um ou uma lista.

**Usuário:** "Faço corte social por 45 reais, degradê 50, e a barba é 25. Se fizer cabelo e barba fecho por 65."

**IA (Processamento em Background):**
*   Utiliza LLM para extrair JSON:
    ```json
    [
      {"name": "Corte Social", "price": 45},
      {"name": "Degradê", "price": 50},
      {"name": "Barba", "price": 25},
      {"name": "Cabelo e Barba", "price": 65}
    ]
    ```

---

### 📧 4. Consolidação e Pagamento
**AI:**
> Ótimo! Para finalizar seu perfil e criarmos seu painel, qual é o seu *e-mail profissional*?

**Usuário:** "contato@barbeariaexemplo.com"

**IA (Finalização Automática):**
1.  Cria usuário `contato@barbeariaexemplo.com` no banco.
2.  Insere os 4 serviços extraídos vinculados ao e-mail.
3.  Gera link de pagamento e QR code.

**AI:**
> ✅ *Perfil criado com sucesso!* 
> 
> 💳 *Assinatura:* Você escolheu o plano *Standard*.
> Para ativar plenamente, acesse seu link de pagamento: https://universal-scheduler.pages.dev/pay/sub?email=contato@barbeariaexemplo.com&plan=Standard
> 
> Quase lá! Agora precisamos conectar seu WhatsApp ao robô.
> 
> 1. Vou gerar um link para você.
> 2. Você abrirá o link em um computador ou outro celular.
> 3. Escaneie o QR Code usando o 'Aparelhos Conectados' no seu WhatsApp.
> 
> Digite *PRONTO* quando estiver com o QR Code na tela.
> 
> 🔗 *Link para o QR Code:* https://universal-scheduler.pages.dev/connect?email=contato@barbeariaexemplo.com

---

### 🤖 5. Automação Ativa
**Usuário:** "PRONTO"
**AI:**
> 🎉 *Parabéns!* Seu robô está configurado e pronto para trabalhar.
> 
> A partir de agora, ele responderá seus clientes e organizará sua agenda.
> 
> Digite *MENU* a qualquer momento para ver suas opções de gestão.

---

### 📈 Resultado Final no Banco de Dados
- **Users**: Registro completo com e-mail, plano, tipo de negócio e `bot_active=1`.
- **Services**: Lista de serviços populada via IA.
- **Appointments**: Pronto para receber agendamentos.
- **Bridge**: Sessão do WhatsApp vinculada.

Tudo isso aconteceu **sem qualquer intervenção humana** de suporte ou configuração manual.
