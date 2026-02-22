/**
 * Agentic AI Logic for Barber Bot - Atualizado para Schema D1
 */

import { ADMIN_PROMPTS, CLIENT_PROMPTS } from './prompts.js';

export const BARBER_TOOLS = [
    {
        name: 'consultar_agenda',
        description: 'Verifica horários ocupados no banco de dados. Use sempre que o usuário perguntar sobre disponibilidade.',
        parameters: {
            type: 'object',
            properties: {
                appointment_date: { type: 'string', description: 'Data YYYY-MM-DD' },
                barber_email: { type: 'string', description: 'E-mail do barbeiro' }
            },
            required: ['appointment_date', 'barber_email']
        }
    }
];

export async function runAgentChat(env, { prompt, isAdmin, barberContext, userEmail }) {
    const { DB, AI } = env;
    const model = '@cf/meta/llama-3.1-8b-instruct';

    // 1. Injeta o Chain of Thought do prompts.js
    const systemPrompt = isAdmin ? ADMIN_PROMPTS.system_admin(barberContext) : CLIENT_PROMPTS.system_ai(barberContext);

    console.log(`[Agente] Iniciando chat. Admin: ${isAdmin} | User: ${userEmail}`);

    // 2. Primeira chamada para a IA (Fase THINK)
    const aiResponse = await AI.run(model, {
        messages: [
            { role: 'system', content: String(systemPrompt) },
            { role: 'user', content: String(prompt) }
        ],
        tools: BARBER_TOOLS 
    });

    console.log("[Agente] Resposta inicial da IA:", JSON.stringify(aiResponse));

    // 3. Fase ACT (Execução das Ferramentas no D1)
    if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
        console.log(`[Agente] 🛠️ Ferramenta detectada: ${aiResponse.tool_calls[0].name}`);
        
        const toolMessages = [
            { role: 'system', content: String(systemPrompt) },
            { role: 'user', content: String(prompt) },
            { role: 'assistant', content: '', tool_calls: aiResponse.tool_calls }
        ];

        for (const call of aiResponse.tool_calls) {
            let toolData = "";

            if (call.name === 'consultar_agenda') {
                const { appointment_date } = call.arguments;
                
                // 🚨 TRAVA DE SEGURANÇA MÁXIMA: 
                // Ignoramos o e-mail que a IA tentou adivinhar e forçamos o seu e-mail real.
                const emailReal = barberContext?.barberEmail || "celsosilvajunior90@gmail.com";

                console.log(`[D1 Forward] Consultando agenda de ${emailReal} em ${appointment_date}`);

                try {
                    const res = await DB.prepare(
                        'SELECT appointment_time FROM appointments WHERE appointment_date = ? AND barber_email = ? AND status != "cancelled"'
                    ).bind(appointment_date, emailReal).all();
                    
                    toolData = res.results.length > 0 
                        ? `Horários ocupados: ${res.results.map(r => r.appointment_time).join(', ')}`
                        : "A agenda está livre no sistema para esta data.";
                    
                    console.log(`[D1 Success] Dados encontrados: ${toolData}`);
                } catch (dbError) {
                    console.error("[D1 Error]", dbError.message);
                    toolData = "Erro ao acessar o banco de dados.";
                }
            }

            toolMessages.push({
                role: 'tool',
                name: call.name,
                tool_call_id: call.id,
                content: String(toolData)
            });
        }

        // 4. Fase ACT Final (Gerar a resposta amigável com os dados reais)
        const finalResponse = await AI.run(model, {
            messages: toolMessages
        });

        return { text: finalResponse.response };
    }

    console.log("[Agente] Nenhuma ferramenta foi chamada. IA respondeu diretamente.");
    return { text: aiResponse.response };
}