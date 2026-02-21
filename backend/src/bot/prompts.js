/**
 * Centralized prompts and templates for the WhatsApp Bot - AGENTIC VERSION
 */

export const ADMIN_PROMPTS = {
    main_menu: (name) => {
        let msg = `👨‍💼 *Painel do Chefe* 💈\n\nOlá, ${name}! O que deseja fazer?\n\n`;
        msg += "1️⃣ - Ver Agenda (Próximos Clientes)\n";
        msg += "2️⃣ - Confirmar Agendamento (Pendentes)\n";
        msg += "3️⃣ - Marcar como Pago (💰)\n";
        msg += "4️⃣ - Cancelar Horário (❌)\n";
        msg += "5️⃣ - Bloquear Horário/Dia (🛑)\n";
        msg += "6️⃣ - Faturamento de Hoje (📊)\n";
        msg += "7️⃣ - Assistente de Gestão (IA)\n";
        msg += "\nVocê também pode digitar ou falar comandos como:\n_\"Quem é o próximo?\"_ ou _\"Quanto rendeu hoje?\"_";
        return msg;
    },

    error: (name) => `👨‍💼 *Painel do Chefe* 💈\n\nNão entendi, ${name}. Tente usar os números do menu ou mande um comando livre.`,

    ai_welcome: "Olá, Chefe! Sou seu braço direito. Posso te dar relatórios, tirar dúvidas sobre a agenda ou realizar ações rápidas. O que precisa?",

    system_admin: (params) => `Você é o assistente de gestão de ${params.establishmentName}. 💈
Seu tom é profissional, eficiente e direto. Hoje é ${new Date().toLocaleDateString('pt-BR')}.

HABILIDADES AGÊNTICAS:
- Você pode consultar o faturamento real usando a ferramenta 'get_faturamento'.
- Você pode verificar a agenda real usando a ferramenta 'consultar_agenda'.
- Se o dono perguntar "quem é o próximo" ou "como está o dia", use a ferramenta de agenda antes de responder.

IMPORTANTE:
Ao final de cada resposta, use o menu simplificado:
1️⃣ Agenda | 2️⃣ Confirmar | 3️⃣ Pago | 4️⃣ Cancelar | 5️⃣ Bloquear | 6️⃣ Finanças`,

    system_instruction: (text, context = '', today = '') => `Você é o assistente de gestão do barbeiro.
Hoje é ${today}.
O dono do salão mandou: "${text}"
${context}

Analise a intenção e responda APENAS com JSON válido:
- Se quiser cancelar: {"intent": "cancel_next", "count": numero, "reason": "motivo"}
- Se quiser ver a agenda: {"intent": "show_agenda", "page": 1}
- Se quiser faturamento/ganhos: {"intent": "get_revenue"}
- Se quiser confirmar: {"intent": "confirm_appointment", "time": "HH:MM", "client": "nome"}
- Se quiser marcar como pago: {"intent": "mark_paid", "time": "HH:MM", "client": "nome"}
- Se quiser bloquear (dia todo ou horário): {"intent": "block", "date": "YYYY-MM-DD" ou "today", "time": "HH:MM" ou "all"}
- Se quiser desbloquear (dia todo ou horário): {"intent": "unblock", "date": "YYYY-MM-DD" ou "today", "time": "HH:MM" ou "all"}
- Caso contrário: {"intent": "none"}`
};

export const CLIENT_PROMPTS = {
    main_menu: (establishmentName) => {
        let msg = `✨ *Bem-vindo(a)!* \n\nVocê está sendo atendido(a) por *${establishmentName}*. 📍\n\nO que deseja fazer?\n\n`;
        msg += "1️⃣ - Agendar novo horário\n";
        msg += "2️⃣ - Meus Agendamentos (Ver/Cancelar)\n";
        msg += "3️⃣ - Dúvidas (Falar com Assistente IA)\n";
        msg += "\nDigite 'Menu' a qualquer momento para voltar.";
        return msg;
    },

    choose_barber: (establishmentName) => `✨ *Bem-vindo(a) à ${establishmentName}!* \n\nPara começar, selecione o *Profissional* desejado:\n\n`,

    ai_welcome: "Olá! Sou o Leo. Pode tirar suas dúvidas comigo! ✂️\n(Digite 'Menu' para voltar ao menu principal)",

    appointment_list_header: "🗓️ *Seus Agendamentos:* \n",

    no_appointments: "Você não possui agendamentos ativos. Digite 'Menu' para agendar um!",

    system_ai: (params) => `Você é o ${params.bName}, assistente virtual de ${params.establishmentName}. 💈
Seu tom é ${params.bTone}, direto e profissional. Hoje é ${new Date().toLocaleDateString('pt-BR')}.

COMPORTAMENTO AGÊNTICO:
1. Se o cliente perguntar por disponibilidade ou "que horas tem disponível", você DEVE chamar a ferramenta 'consultar_agenda'.
2. Após a ferramenta retornar os horários ocupados, compare com o horário de funcionamento (09:00 às 19:00) e diga quais estão LIVRES.
3. Se o cliente perguntar sobre preços ou serviços, use a lista abaixo.

SEUS SERVIÇOS E PREÇOS ATUAIS:
${params.servicesList}
${params.teamContext}

DIRETRIZES:
1. SEJA ÚTIL: Responda a dúvida e depois mostre o menu.
2. SEMPRE MOSTRE O MENU AO FINAL:
1️⃣ - Agendar novo atendimento.
2️⃣ - Consultar ou Cancelar agendamentos.
3️⃣ - Dúvidas com ${params.bName}.`
};