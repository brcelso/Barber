import { ADMIN_PROMPTS, CLIENT_PROMPTS } from './prompts.js';
import { TOOL_ACTIONS } from './toolActions.js';

export const BUSINESS_TOOLS = [
    {
        name: 'consultar_agenda',
        description: 'Consulta o estado atual da agenda para uma data específica.',
        parameters: {
            type: 'object',
            properties: {
                appointment_date: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
                professional_email: { type: 'string', description: 'E-mail do profissional/prestador' }
            },
            required: ['appointment_date', 'professional_email']
        }
    },
    {
        name: 'agendar_cliente',
        description: 'Cria um novo agendamento no banco de dados para um serviço específico.',
        parameters: {
            type: 'object',
            properties: {
                user_email: { type: 'string', description: 'E-mail do cliente' },
                professional_email: { type: 'string', description: 'E-mail do profissional' },
                service_id: { type: 'string', description: 'ID do serviço que será prestado' },
                date: { type: 'string', description: 'Data YYYY-MM-DD' },
                time: { type: 'string', description: 'Horário HH:mm' }
            },
            required: ['user_email', 'professional_email', 'service_id', 'date', 'time']
        }
    },
    {
        name: 'alterar_status_agendamento',
        description: 'Altera o status de um agendamento (confirmado ou cancelado).',
        parameters: {
            type: 'object',
            properties: {
                appointment_id: { type: 'string', description: 'ID único do agendamento' },
                status: { type: 'string', enum: ['confirmed', 'cancelled'], description: 'Novo estado' }
            },
            required: ['appointment_id', 'status']
        }
    },
    {
        name: 'consultar_faturamento',
        description: 'Calcula o faturamento total em um período específico na unidade.',
        parameters: {
            type: 'object',
            properties: {
                professional_email: { type: 'string', description: 'E-mail do prestador ou dono' },
                start_date: { type: 'string', description: 'Data inicial YYYY-MM-DD' },
                end_date: { type: 'string', description: 'Data final YYYY-MM-DD' }
            },
            required: ['professional_email', 'start_date', 'end_date']
        }
    },
    {
        name: 'gerenciar_bloqueios',
        description: 'Bloqueia ou libera horários/dias inteiros para novos atendimentos.',
        parameters: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: ['block', 'unblock'], description: 'Bloquear ou liberar' },
                type: { type: 'string', enum: ['slot', 'day'], description: 'Um horário específico ou o dia todo' },
                date: { type: 'string', description: 'Data YYYY-MM-DD' },
                time: { type: 'string', description: 'Horário HH:mm (opcional para dia inteiro)' }
            },
            required: ['action', 'type', 'date']
        }
    },
    {
        name: 'gerenciar_servicos',
        description: 'Cria, edita ou remove serviços do catálogo do estabelecimento.',
        parameters: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: ['create', 'update', 'delete'], description: 'Ação a realizar' },
                id: { type: 'string', description: 'ID do serviço (necessário para update/delete)' },
                name: { type: 'string', description: 'Nome do serviço' },
                price: { type: 'number', description: 'Preço' },
                duration: { type: 'number', description: 'Duração em minutos' },
                description: { type: 'string', description: 'Descrição' }
            },
            required: ['action']
        }
    },
    {
        name: 'gerenciar_equipe',
        description: 'Adiciona, remove ou altera permissões de membros da equipe.',
        parameters: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: ['add', 'recruit', 'remove', 'update_role'], description: 'Ação na equipe' },
                email: { type: 'string', description: 'E-mail do membro' },
                name: { type: 'string', description: 'Nome do profissional' },
                is_admin: { type: 'boolean', description: 'Dar poder de gestão' },
                is_professional: { type: 'boolean', description: 'Marcar como prestador de serviço' }
            },
            required: ['action', 'email']
        }
    },
    {
        name: 'gerenciar_assinatura',
        description: 'Gerencia o plano e a validade da assinatura do estabelecimento.',
        parameters: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'E-mail do dono da unidade' },
                plan: { type: 'string', enum: ['Individual', 'Standard', 'Pro'], description: 'Nome do plano' },
                add_days: { type: 'number', description: 'Dias para adicionar à validade' }
            },
            required: ['email', 'plan', 'add_days']
        }
    },
    {
        name: 'gerenciar_robos',
        description: 'Gerencia a conexão do hardware (WhatsApp) ou a Resposta Automática (IA).',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['start_bridge', 'stop_bridge', 'restart_bridge', 'activate_ia', 'deactivate_ia'],
                    description: 'start/stop/restart_bridge (Conexão WhatsApp), activate/deactivate_ia (Resposta automática da IA para clientes)'
                },
                email: { type: 'string', description: 'E-mail da unidade' }
            },
            required: ['action', 'email']
        }
    },
    {
        name: 'ver_status_whatsapp',
        description: 'Verifica o status atual da conexão do WhatsApp e obtém o QR Code se estiver aguardando conexão.',
        parameters: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'E-mail da unidade' }
            },
            required: ['email']
        }
    },
    {
        name: 'gerenciar_configuracoes',
        description: 'Altera configurações básicas do estabelecimento como nome, nicho, tom de voz ou tokens de pagamento.',
        parameters: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'E-mail da unidade/dono' },
                shop_name: { type: 'string', description: 'Nome do estabelecimento' },
                business_type: { type: 'string', description: 'Nicho: barbearia, petshop, salao, clinica' },
                bot_name: { type: 'string', description: 'Nome do robô' },
                bot_tone: { type: 'string', description: 'Tom: profissional, amigável, engraçado' },
                mp_access_token: { type: 'string', description: 'Access Token do Mercado Pago do Cliente' }
            },
            required: ['email']
        }
    }
];

export async function runAgentChat(env, { prompt, userEmail, isAdmin, professionalContext }) {

    // 🛡️ ESCUDO ANTI-STATUS
    if (!prompt || String(prompt).trim() === '' || String(prompt) === 'undefined') {
        return { text: "" };
    }

    const { DB, AI } = env;
    const model = '@cf/meta/llama-3.1-8b-instruct';
    const MASTER_EMAIL = "celsosilvajunior90@gmail.com";
    const emailReal = (professionalContext?.professionalEmail && professionalContext.professionalEmail !== "undefined")
        ? professionalContext.professionalEmail
        : MASTER_EMAIL;

    // Safety: If it's Master, ensure the prompt isn't accidentally stopping its own connection
    if (emailReal === MASTER_EMAIL && (prompt.toLowerCase().includes("parar") || prompt.toLowerCase().includes("stop") || prompt.toLowerCase().includes("desligar"))) {
        if (!prompt.toLowerCase().includes("respostas") && !prompt.toLowerCase().includes("ia") && !prompt.toLowerCase().includes("inteligencia")) {
            // If the user didn't specify IA/Answers, we force it to NOT stop the bridge
            professionalContext.force_ia_only = true;
        }
    }

    // 🔑 DETERMINAR NÍVEL DE ACESSO (RBAC)
    let role = 'client';
    if (isAdmin) {
        if (emailReal === 'celsosilvajunior90@gmail.com') role = 'master';
        else if (!professionalContext.owner_id) role = 'owner';
        else role = 'staff';
    }

    // ⚒️ FILTRAGEM DE FERRAMENTAS POR PAPEL
    const roleTools = {
        master: BUSINESS_TOOLS.map(t => t.name), // Tudo
        owner: ['consultar_agenda', 'agendar_cliente', 'alterar_status_agendamento', 'consultar_faturamento', 'gerenciar_bloqueios', 'gerenciar_servicos', 'gerenciar_equipe', 'gerenciar_robos', 'gerenciar_configuracoes', 'ver_status_whatsapp'],
        staff: ['consultar_agenda', 'alterar_status_agendamento', 'gerenciar_bloqueios'],
        client: ['consultar_agenda', 'agendar_cliente', 'alterar_status_agendamento']
    };

    const allowedTools = BUSINESS_TOOLS.filter(t => roleTools[role].includes(t.name));

    // 📝 SELEÇÃO DE PROMPT
    let systemPrompt = "";
    if (role === 'master') systemPrompt = ADMIN_PROMPTS.system_master(professionalContext);
    else if (role === 'owner') systemPrompt = ADMIN_PROMPTS.system_owner(professionalContext);
    else if (role === 'staff') systemPrompt = ADMIN_PROMPTS.system_staff(professionalContext);
    else systemPrompt = CLIENT_PROMPTS.system_ai({ ...professionalContext, userEmail });

    // 🕰️ CONTEXTO TEMPORAL (Crucial para não agendar no passado)
    const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hoje = agora.toISOString().split('T')[0];
    const horaAtual = agora.toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' });

    systemPrompt += `\n\n[CONTEXTO TEMPORAL]: Hoje é ${hoje}, agora são ${horaAtual}.`;
    if (role === 'client') {
        systemPrompt += `\n⚠️ IMPORTANTE: Se o cliente quiser agendar para hoje (${hoje}), você NUNCA deve oferecer ou aceitar horários anteriores a ${horaAtual}.`;
    }

    // 🚀 ESTRATÉGIA ANTECIPATÓRIA (Apenas para quem tem poder de agenda)
    let dynamicContext = "";
    if (role === 'master' || role === 'owner' || role === 'staff') {
        try {
            const res = await DB.prepare(
                "SELECT * FROM appointments WHERE appointment_date = ? AND barber_email = ? AND status != 'cancelled' ORDER BY appointment_time ASC"
            ).bind(hoje, emailReal).all();

            if (res.results && res.results.length > 0) {
                dynamicContext = `\n\n[BRIEFING DO DIA - ${hoje}]: Existem ${res.results.length} agendamentos hoje: ${JSON.stringify(res.results)}.`;
            } else {
                dynamicContext = `\n\n[BRIEFING DO DIA]: Sua agenda de hoje (${hoje}) está livre.`;
            }
        } catch (e) {
            console.error("[Pre-fetch Error]", e);
        }
    }

    systemPrompt += dynamicContext;

    // 🚀 O EMPURRÃO DE CONTEXTO
    let userMessageContent = String(prompt);
    if (isAdmin && userMessageContent.length < 15) {
        userMessageContent += " (Aja agora conforme seu nível de acesso e resuma o briefing se disponível)";
    }

    const messages = [
        { role: 'system', content: String(systemPrompt) },
        { role: 'user', content: userMessageContent }
    ];

    console.log(`[Agente] Processando mensagem. Role: ${role}`);

    // 1. PRIMEIRA CHAMADA
    const aiResponse = await AI.run(model, {
        messages: messages,
        tools: allowedTools
    });

    // 2. FASE ACT (FERRAMENTAS)
    if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {

        const toolMessages = [
            ...messages,
            { role: 'assistant', content: '', tool_calls: aiResponse.tool_calls }
        ];

        for (const call of aiResponse.tool_calls) {
            let toolData = "";
            const actionFunc = TOOL_ACTIONS[call.name];

            if (actionFunc) {
                const result = await actionFunc({
                    args: call.arguments,
                    DB,
                    AI,
                    env, // Passando o env completo para acesso a variáveis globais
                    emailReal,
                    professionalContext
                });
                toolData = JSON.stringify(result);
            } else {
                toolData = JSON.stringify({ status: "erro", msg: "Ferramenta não mapeada no executor." });
            }

            toolMessages.push({
                role: 'tool',
                name: call.name,
                tool_call_id: call.id,
                content: String(toolData)
            });
        }

        // 3. FASE REFINEMENT
        const finalResponse = await AI.run(model, {
            messages: toolMessages
        });

        return {
            text: finalResponse.response,
            tool_calls: aiResponse.tool_calls,
            tool_results: toolMessages.filter(m => m.role === 'tool')
        };
    }

    return { text: aiResponse.response };
}