/**
 * Agentic AI Logic for Barber Bot - Versão "Contexto Rico"
 * Arquitetura: Middleware de Normalização + Entrega de Contexto Total (SELECT *)
 */

import { ADMIN_PROMPTS, CLIENT_PROMPTS } from './prompts.js';

export const BARBER_TOOLS = [
    {
        name: 'consultar_agenda',
        description: 'Consulta o estado atual da agenda no banco de dados para uma data específica.',
        parameters: {
            type: 'object',
            properties: {
                appointment_date: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
                barber_email: { type: 'string', description: 'E-mail do barbeiro responsável' }
            },
            required: ['appointment_date', 'barber_email']
        }
    }
];

export async function runAgentChat(env, { prompt, isAdmin, barberContext, userEmail }) {
    
    // 🛡️ ESCUDO ANTI-STATUS (Previne Erro 5006 por prompts vazios do WhatsApp)
    if (!prompt || String(prompt).trim() === '' || String(prompt) === 'undefined') {
        return { text: "" }; 
    }

    const { DB, AI } = env;
    const model = '@cf/meta/llama-3.1-8b-instruct';
    const systemPrompt = isAdmin ? ADMIN_PROMPTS.system_admin(barberContext) : CLIENT_PROMPTS.system_ai(barberContext);

    console.log(`[Agente] Início - Admin: ${isAdmin} | User: ${userEmail}`);
    
    // 1. FASE THINK (A IA analisa a intenção e decide usar ferramentas)
    const aiResponse = await AI.run(model, {
        messages: [
            { role: 'system', content: String(systemPrompt) },
            { role: 'user', content: String(prompt) }
        ],
        tools: BARBER_TOOLS 
    });

    // 2. FASE ACT (Processamento das Ferramentas com Normalização de Dados)
    if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
        
        const toolMessages = [
            { role: 'system', content: String(systemPrompt) },
            { role: 'user', content: String(prompt) },
            { role: 'assistant', content: '', tool_calls: aiResponse.tool_calls }
        ];

        for (const call of aiResponse.tool_calls) {
            let toolData = "";

            if (call.name === 'consultar_agenda') {
                let { appointment_date } = call.arguments; 
                
                // ⏱️ NORMALIZADOR DINÂMICO DE TEMPO
                // Garante que a IA sempre busque no ano correto do servidor, corrigindo alucinações de 1970/2024
                const anoAtual = new Date().getFullYear().toString(); 
                if (appointment_date && appointment_date.includes('-')) {
                    const partesData = appointment_date.split('-');
                    if (partesData[0] !== anoAtual) {
                        partesData[0] = anoAtual;
                        appointment_date = partesData.join('-');
                        console.log(`[Normalização] Data corrigida para o ano vigente: ${appointment_date}`);
                    }
                }

                // TRAVA DE SEGURANÇA DO E-MAIL (Evita o "undefined")
                const emailReal = (barberContext?.barberEmail && barberContext.barberEmail !== "undefined") 
                    ? barberContext.barberEmail 
                    : "celsosilvajunior90@gmail.com";

                console.log(`[D1 Forward] Consultando contexto total de ${emailReal} em ${appointment_date}`);

                try {
                    // 🚀 MUDANÇA PARA EXCELÊNCIA: SELECT * // Entregamos todas as colunas (cliente, serviço, etc.) para a IA poder decidir.
                    const res = await DB.prepare(
                        "SELECT * FROM appointments WHERE appointment_date LIKE ? AND barber_email = ? AND status != 'cancelled'"
                    ).bind(`${appointment_date}%`, emailReal).all();
                    
                    console.log(`[D1 RAW DB RESULT]`, JSON.stringify(res.results));

                    // 🤖 LÍNGUA DO ROBÔ: Enviamos um JSON rico em contexto.
                    toolData = JSON.stringify({
                        status: "sucesso",
                        contexto_da_agenda: {
                            data: appointment_date,
                            total_ocupado: res.results.length,
                            agendamentos: res.results // A IA vê a linha inteira aqui
                        }
                    });
                    
                } catch (dbError) {
                    console.error("[D1 Error]", dbError.message);
                    toolData = JSON.stringify({ status: "erro", mensagem: "Falha ao acessar banco de dados." });
                }
            }

            toolMessages.push({
                role: 'tool',
                name: call.name,
                tool_call_id: call.id,
                content: String(toolData)
            });
        }

        // 3. FASE REFINEMENT (A IA processa o JSON e cria uma resposta humana e contextualizada)
        const finalResponse = await AI.run(model, {
            messages: toolMessages
        });

        return { text: finalResponse.response };
    }

    // Caso a IA responda sem ferramentas
    return { text: aiResponse.response };
}