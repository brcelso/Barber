/**
 * Agentic AI Logic for Barber Bot - Versão Proativa Total
 * Arquitetura: Pre-fetch Context + User Message Injection (Admin)
 */

import { ADMIN_PROMPTS, CLIENT_PROMPTS } from './prompts.js';

export const BARBER_TOOLS = [
    {
        name: 'consultar_agenda',
        description: 'Consulta o estado atual da agenda no banco de dados para uma data específica.',
        parameters: {
            type: 'object',
            properties: {
                appointment_date: { type: 'string', description: 'Data no formato exato YYYY-MM-DD' },
                barber_email: { type: 'string', description: 'E-mail do barbeiro responsável' }
            },
            required: ['appointment_date', 'barber_email']
        }
    }
];

export async function runAgentChat(env, { prompt, isAdmin, barberContext }) {
    
    // 🛡️ ESCUDO ANTI-STATUS
    if (!prompt || String(prompt).trim() === '' || String(prompt) === 'undefined') {
        return { text: "" }; 
    }

    const { DB, AI } = env;
    const model = '@cf/meta/llama-3.1-8b-instruct';
    const emailReal = (barberContext?.barberEmail && barberContext.barberEmail !== "undefined") 
        ? barberContext.barberEmail 
        : "celsosilvajunior90@gmail.com";

    let dynamicContext = "";

    // 🚀 ESTRATÉGIA ANTECIPATÓRIA (Busca no D1 antes da IA)
    if (isAdmin) {
        const hoje = new Date().toISOString().split('T')[0];
        try {
            const res = await DB.prepare(
                "SELECT * FROM appointments WHERE appointment_date = ? AND barber_email = ? AND status != 'cancelled'"
            ).bind(hoje, emailReal).all();
            
            if (res.results && res.results.length > 0) {
                dynamicContext = `\n\n[BRIEFING DO DIA - ${hoje}]: Existem ${res.results.length} agendamentos hoje: ${JSON.stringify(res.results)}.`;
            } else {
                dynamicContext = `\n\n[BRIEFING DO DIA]: A agenda de hoje (${hoje}) está totalmente livre.`;
            }
        } catch (e) {
            console.error("[Pre-fetch Error]", e);
        }
    }

    const systemPrompt = isAdmin 
        ? ADMIN_PROMPTS.system_admin(barberContext) + dynamicContext 
        : CLIENT_PROMPTS.system_ai(barberContext);

    // 🚀 O EMPURRÃO DE CONTEXTO (Garante que a IA não ignore o briefing no "Oi")
    let userMessageContent = String(prompt);
    if (isAdmin && userMessageContent.length < 15) {
        userMessageContent += " (Aja agora conforme a regra de saudação proativa e resuma o briefing do dia para mim)";
    }

    const messages = [
        { role: 'system', content: String(systemPrompt) },
        { role: 'user', content: userMessageContent }
    ];

    console.log(`[Agente] Processando mensagem. Admin: ${isAdmin}`);

    // 1. PRIMEIRA CHAMADA (THINK)
    const aiResponse = await AI.run(model, {
        messages: messages,
        tools: BARBER_TOOLS 
    });

    // 2. FASE ACT (FERRAMENTAS)
    if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
        
        const toolMessages = [
            ...messages,
            { role: 'assistant', content: '', tool_calls: aiResponse.tool_calls }
        ];

        for (const call of aiResponse.tool_calls) {
            let toolData = "";

            if (call.name === 'consultar_agenda') {
                let { appointment_date } = call.arguments; 
                
                const anoAtual = new Date().getFullYear().toString(); 
                if (appointment_date && appointment_date.includes('-')) {
                    const partesData = appointment_date.split('-');
                    if (partesData[0] !== anoAtual) {
                        partesData[0] = anoAtual;
                        appointment_date = partesData.join('-');
                    }
                }

                try {
                    const res = await DB.prepare(
                        "SELECT * FROM appointments WHERE appointment_date LIKE ? AND barber_email = ? AND status != 'cancelled'"
                    ).bind(`${appointment_date}%`, emailReal).all();
                    
                    toolData = JSON.stringify({
                        status: "sucesso",
                        contexto_da_agenda: {
                            data: appointment_date,
                            total_ocupado: res.results.length,
                            agendamentos: res.results
                        }
                    });
                } catch (e) {
                    console.error("[D1 Error]", e);
                    toolData = JSON.stringify({ status: "erro", mensagem: "Erro no D1." });
                }
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

        return { text: finalResponse.response };
    }

    return { text: aiResponse.response };
}