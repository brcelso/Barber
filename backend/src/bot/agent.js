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
    if (!prompt || String(prompt).trim() === '' || String(prompt) === 'undefined') {
        console.log("🚨 [Agente] Prompt vazio ou evento de status recebido. Abortando IA.");
        return { text: "" }; // Retorna vazio para não mandar nada pro cliente
    }

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
                
                const emailReal = barberContext?.barberEmail || "celsosilvajunior90@gmail.com";

                console.log(`[D1 Forward] Consultando agenda de ${emailReal} em ${appointment_date}`);

                try {
                    // MUDANÇA 1: Mudamos "cancelled" para 'cancelled' (aspas simples para texto no SQL)
                    // MUDANÇA 2: Usamos LIKE na data caso tenha algum espaço invisível salvo no banco
                    const res = await DB.prepare(
                        "SELECT appointment_time FROM appointments WHERE appointment_date LIKE ? AND barber_email = ? AND status != 'cancelled'"
                    ).bind(`${appointment_date}%`, emailReal).all();
                    
                    console.log(`[D1 RAW DB RESULT]`, JSON.stringify(res.results)); // LOG NOVO CRÍTICO

                    toolData = res.results.length > 0 
                        ? `INFORMAÇÃO REAL DO BANCO: Horários já ocupados neste dia: ${res.results.map(r => r.appointment_time).join(', ')}. Diga isso ao usuário.`
                        : `A agenda está livre no sistema para esta data.`;
                    
                    console.log(`[D1 Success] Dados enviados para a IA: ${toolData}`);
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