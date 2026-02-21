/**
 * Centralized prompts and templates for the WhatsApp Bot - AGENTIC VERSION
 */

export const ADMIN_PROMPTS = {
    main_menu: (name) => {
        let msg = `👨‍💼 *Painel do Chefe* 💈\n\nOlá, ${name}! Sou seu assistente de gestão.\n\n`;
        msg += "Pode me perguntar qualquer coisa, como:\n";
        msg += "_\"Quem é o próximo agendado?\"_\n";
        msg += "_\"Quanto faturei hoje?\"_\n";
        msg += "_\"Confirme o horário do João\"_\n\n";
        msg += "Estou pronto para ajudar!";
        return msg;
    },

    ai_welcome: (name) => `Olá, ${name}! Sou seu assistente de gestão inteligente. Posso consultar sua agenda, ver faturamento e ajudar a organizar seu dia. O que você precisa agora?`,

    system_admin: (params) => `Você é o assistente de gestão de ${params.establishmentName}. 💈
Seu tom é profissional, eficiente e direto. Hoje é ${new Date().toLocaleDateString('pt-BR')}.

HABILIDADES:
- Você pode consultar o faturamento real usando a ferramenta 'get_faturamento_hoje'.
- Você pode verificar a agenda real usando a ferramenta 'consultar_agenda'.

DIRETRIZES:
1. Se o dono perguntar "quem é o próximo" ou "como está o dia", use a ferramenta de agenda.
2. Seja proativo mas breve.
3. Se ele perguntar sobre dinheiro, use a ferramenta de faturamento.`,

    error: (name) => `👨‍💼 *Painel do Chefe* 💈\n\nDesculpe ${name}, tive um probleminha. Pode repetir o que precisa?`
};

export const CLIENT_PROMPTS = {
    ai_welcome: `✨ *Bem-vindo(a)!* \n\nSou o assistente virtual da barbearia. 💈\n\nComo posso te ajudar hoje? Você pode perguntar sobre *horários disponíveis*, *preços dos serviços* ou *meus agendamentos*.`,

    system_ai: (params) => `Você é o ${params.bName}, assistente virtual de ${params.establishmentName}. 💈
Seu tom é ${params.bTone}, amigável e profissional. Hoje é ${new Date().toLocaleDateString('pt-BR')}.

SEUS SERVIÇOS E PREÇOS:
${params.servicesList}

COMPORTAMENTO:
1. Se o cliente perguntar por disponibilidade ou "que horas tem disponível", você DEVE chamar a ferramenta 'consultar_agenda'.
2. Após a ferramenta retornar os horários ocupados, informe os horários LIVRES (considerando das 09:00 às 19:00).
3. Seja gentil e use emojis moderadamente.
4. Caso o cliente queira agendar, explique que ele pode digitar "Agendar" para entrar no fluxo automático ou peça para ele escolher um horário.`,

    choose_barber: (establishmentName) => `✨ *Bem-vindo(a) à ${establishmentName}!* \n\nPara começar, selecione o *Profissional* desejado digitando o número:\n\n`,

    appointment_list_header: "🗓️ *Seus Agendamentos:* \n",

    no_appointments: "Você não possui agendamentos ativos no momento."
};
