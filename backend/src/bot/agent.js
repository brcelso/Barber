/**
 * Agentic AI Logic for Barber Bot
 * Arquitetura: Normalizador Dinâmico de Tempo + Escudo Anti-Status
 */

import { ADMIN_PROMPTS, CLIENT_PROMPTS } from './prompts.js';

export const BARBER_TOOLS = [
    {
        name: 'consultar_agenda',
        description: 'Verifica horários ocupados no banco de dados para uma data específica.',
        parameters: {
            type: 'object',
            properties: {
                appointment_date: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
                barber_email: { type: 'string', description: 'E-mail do barbeiro' }
            },
            required: ['appointment_date', 'barber_email']
        }
    }
];

export async function runAgentChat(env, { prompt, isAdmin, barberContext, userEmail }) {
    
    // 🛡️ ESCUDO ANTI-WHATSAPP (Previne o Erro 5006 de Recibo de Leitura)
    if (!prompt || String(prompt).trim() === '' || String(prompt) === 'undefined') {
        return { text: "" }; 
    }

    const { DB, AI } = env;
    const model = '@cf/meta/llama-3.1-8b-instruct';
    const systemPrompt = isAdmin ? ADMIN_PROMPTS.system_admin(barberContext) : CLIENT_PROMPTS.system_ai(barberContext);

    console.log(`[Agente] Iniciando chat. Admin: ${isAdmin} | User: ${userEmail}`);
    
    // 1. Fase THINK
    const aiResponse = await AI.run(model, {
        messages: [
            { role: 'system', content: String(systemPrompt) },
            { role: 'user', content: String(prompt) }
        ],
        tools: BARBER_TOOLS 
    });

    console.log("[Agente] Resposta inicial da IA:", JSON.stringify(aiResponse));

    // 2. Fase ACT (Ferramentas)
    if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
        
        const toolMessages = [
            { role: 'system', content: String(systemPrompt) },
            { role: 'user', content: String(prompt) },
            { role: 'assistant', content: '', tool_calls: aiResponse.tool_calls }
        ];

        for (const call of aiResponse.tool_calls) {
            let toolData = "";

            if (call.name === 'consultar_agenda') {
                // Aqui pegamos a data maluca que a IA mandou (ex: 1970-02-22)
                let { appointment_date } = call.arguments; 
                
                // ⏱️ O NORMALIZADOR MÁGICO (Intercepta ANTES do banco de dados)
                const anoAtual = new Date().getFullYear().toString(); 
                
                if (appointment_date && appointment_date.includes('-')) {
                    const partesData = appointment_date.split('-'); // Corta em ['1970', '02', '22']
                    if (partesData[0] !== anoAtual) {
                        partesData[0] = anoAtual; // Troca o 1970 por 2026
                        appointment_date = partesData.join('-'); // Junta de novo: '2026-02-22'
                        
                        // ESTE LOG VAI PROVAR QUE A MÁGICA ACONTECEU:
                        console.log(`[Normalização] Ano corrigido pela engenharia para: ${appointment_date}`);
                    }
                }

                // Trava de segurança do e-mail
                const emailReal = (barberContext?.barberEmail && barberContext.barberEmail !== "undefined") 
                    ? barberContext.barberEmail 
                    : "celsosilvajunior90@gmail.com";

                console.log(`[D1 Forward] Consultando agenda de ${emailReal} em ${appointment_date}`);

                try {
                    const res = await DB.prepare(
                        "SELECT appointment_time FROM appointments WHERE appointment_date LIKE ? AND barber_email = ? AND status != 'cancelled'"
                    ).bind(`${appointment_date}%`, emailReal).all();
                    
                    console.log(`[D1 RAW DB RESULT]`, JSON.stringify(res.results));

                    // 🤖 Deixamos a resposta 100% NEUTRA e DIRETA para a IA não se confundir
                    toolData = res.results.length > 0 
                        ? `DADOS RETORNADOS: A agenda para esta data possui horários OCUPADOS às: ${res.results.map(r => r.appointment_time).join(', ')}.`
                        : `DADOS RETORNADOS: A agenda para esta data está 100% LIVRE.`;
                    
                    console.log(`[D1 Success] Dados enviados de volta para a IA: ${toolData}`);
                    
                } catch (dbError) {
                    console.error("[D1 Error]", dbError.message);
                    toolData = "Erro ao acessar o banco de dados interno.";
                }
            }

            toolMessages.push({
                role: 'tool',
                name: call.name,
                tool_call_id: call.id,
                content: String(toolData)
            });
        }

        // 3. Fase ACT Final
        const finalResponse = await AI.run(model, {
            messages: toolMessages
        });

        return { text: finalResponse.response };
    }

    return { text: aiResponse.response };
}