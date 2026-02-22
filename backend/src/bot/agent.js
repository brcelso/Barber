/**
 * Agentic AI Logic for Barber Bot
 * Arquitetura: Dynamic Context + Anti-Status Shield + D1 Forwarding
 */

import { ADMIN_PROMPTS, CLIENT_PROMPTS } from './prompts.js';

// Captura o ano real do servidor no momento exato em que o bot roda
const ANO_ATUAL = new Date().getFullYear();

export const BARBER_TOOLS = [
    {
        name: 'consultar_agenda',
        // Injetamos a regra temporal DIRETAMENTE na mente da IA antes dela usar a ferramenta
        description: `Verifica horários ocupados no banco de dados. O ANO ATUAL É ${ANO_ATUAL}. Ao preencher 'appointment_date', você DEVE obrigatoriamente usar o ano de ${ANO_ATUAL} (ex: ${ANO_ATUAL}-02-22), a menos que o usuário mencione explicitamente um ano diferente.`,
        parameters: {
            type: 'object',
            properties: {
                appointment_date: { type: 'string', description: `Data no formato exato YYYY-MM-DD. Lembre-se que o ano atual é ${ANO_ATUAL}.` },
                barber_email: { type: 'string', description: 'E-mail do barbeiro' }
            },
            required: ['appointment_date', 'barber_email']
        }
    }
];

export async function runAgentChat(env, { prompt, isAdmin, barberContext, userEmail }) {
    
    // 🛡️ ESCUDO ANTI-WHATSAPP STATUS (Previne o Erro 5006)
    // Se o WhatsApp enviar um recibo de leitura ("undefined" ou vazio), nós abortamos antes de gastar recursos da IA.
    if (!prompt || String(prompt).trim() === '' || String(prompt) === 'undefined') {
        console.log("🚨 [Agente] Prompt vazio ou evento de status do WhatsApp recebido. Abortando execução da IA.");
        return { text: "" }; 
    }

    const { DB, AI } = env;
    
    // Mantemos o Llama 3.1 8B pois é o mais estável e rápido para uso de ferramentas (Tools)
    const model = '@cf/meta/llama-3.1-8b-instruct';

    // Puxa o Chain of Thought do prompts.js
    const systemPrompt = isAdmin ? ADMIN_PROMPTS.system_admin(barberContext) : CLIENT_PROMPTS.system_ai(barberContext);

    console.log(`[Agente] Iniciando chat. Admin: ${isAdmin} | User: ${userEmail}`);
    console.log(`[Agente] Mensagem do cliente: "${prompt}"`);

    // 1. Primeira chamada para a IA (Fase THINK)
    const aiResponse = await AI.run(model, {
        messages: [
            { role: 'system', content: String(systemPrompt) },
            { role: 'user', content: String(prompt) }
        ],
        tools: BARBER_TOOLS 
    });

    console.log("[Agente] Resposta inicial da IA (Tool Calls):", JSON.stringify(aiResponse));

    // 2. Fase ACT (Execução das Ferramentas no Banco de Dados D1)
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
                
                // 🚨 TRAVA DE SEGURANÇA DO E-MAIL: 
                // Ignoramos qualquer e-mail genérico que a IA tente inventar e forçamos o e-mail real do barbeiro.
                const emailReal = (barberContext?.barberEmail && barberContext.barberEmail !== "undefined") 
                    ? barberContext.barberEmail 
                    : "celsosilvajunior90@gmail.com";

                console.log(`[D1 Forward] Consultando agenda de ${emailReal} em ${appointment_date}`);

                try {
                    // Usamos LIKE e aspas simples 'cancelled' para garantir compatibilidade com o SQLite do D1
                    const res = await DB.prepare(
                        "SELECT appointment_time FROM appointments WHERE appointment_date LIKE ? AND barber_email = ? AND status != 'cancelled'"
                    ).bind(`${appointment_date}%`, emailReal).all();
                    
                    console.log(`[D1 RAW DB RESULT]`, JSON.stringify(res.results));

                    toolData = res.results.length > 0 
                        ? `INFORMAÇÃO REAL DO BANCO: Horários já ocupados neste dia: ${res.results.map(r => r.appointment_time).join(', ')}. Baseado nisso, sugira horários livres.`
                        : `A agenda está totalmente livre no sistema para esta data.`;
                    
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

        // 3. Fase ACT Final (IA lê os dados do banco e gera a resposta amigável para o cliente)
        const finalResponse = await AI.run(model, {
            messages: toolMessages
        });

        return { text: finalResponse.response };
    }

    console.log("[Agente] Nenhuma ferramenta foi necessária. IA respondeu diretamente.");
    return { text: aiResponse.response };
}