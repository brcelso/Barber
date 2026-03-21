/**
 * RAG Layer - Retrieval-Augmented Generation for Universal Scheduler
 * Filtra dinamicamente o contexto baseado na intenção do usuário.
 */

export async function getSmartContext(DB, userMessage, professionalEmail, userEmail = null) {
    const textLower = userMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Identificadores de intenção simples (Keywords - sem acentos após normalização)
    const keywords = {
        services: /(preco|quanto|servico|corte|faz|valor|horario|agenda|marcar|agendar|disponivel)/i,
        team: /(quem|atende|profissional|barbeiro|cabeleireiro|equipe|time|membro)/i,
        business: /(nome|onde|endereco|local|loja|estabelecimento|empresa|unidade|unidades)/i,
        history: /(meu|meus|agendamento|consulta|horario|marcado|agenda)/i
    };

    let context = "\n[CONTEXTO DE NEGÓCIO SELECIONADO]:\n";
    let hasContext = false;

    try {
        const isMaster = professionalEmail === 'celsosilvajunior90@gmail.com';

        // 0. Informações da Unidade (Branding e Mensagens) - Sempre útil para consistência
        const biz = await DB.prepare(
            "SELECT shop_name, business_type, bot_name, msg_welcome, msg_confirm_booking FROM users WHERE email = ?"
        ).bind(professionalEmail).first();
        
        if (biz) {
            context += `\nESTABELECIMENTO: ${biz.shop_name || 'N/A'}\n- Nicho: ${biz.business_type}\n- Nome do Robô: ${biz.bot_name || 'Leo'}\n`;
            hasContext = true;
        }

        // 1. Busca de Serviços (se necessário)
        if (keywords.services.test(textLower)) {
            const services = await DB.prepare(
                "SELECT id, name, price, duration_minutes, description FROM services WHERE id != 'block' AND barber_email = ?"
            ).bind(professionalEmail).all();
            
            if (services.results?.length > 0) {
                context += "\nCATÁLOGO DE SERVIÇOS:\n";
                context += services.results.map(s => `- ID: ${s.id} | ${s.name}: R$ ${s.price} (${s.duration_minutes}min)${s.description ? ' - ' + s.description : ''}`).join('\n');
                hasContext = true;
            }
        }

        // 2. Busca de Equipe ou Lista de Unidades (se Master)
        if (keywords.team.test(textLower) || (isMaster && keywords.business.test(textLower))) {
            if (isMaster) {
                const units = await DB.prepare(
                    "SELECT name, email, business_type, plan, subscription_expires, wa_status FROM users WHERE is_admin = 1 AND owner_id IS NULL"
                ).all();
                
                if (units.results?.length > 0) {
                    context += "\nUNIDADES DO ECOSSISTEMA (GESTOR MASTER):\n";
                    context += units.results.map(u => `- Unidade: ${u.name} | E-mail: ${u.email} | Plano: ${u.plan} | Expira: ${u.subscription_expires || 'N/A'} | WP: ${u.wa_status || 'desconectado'}`).join('\n');
                    hasContext = true;
                }
            } else {
                const team = await DB.prepare(
                    "SELECT name, email, business_type FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)"
                ).bind(professionalEmail, professionalEmail).all();

                if (team.results?.length > 0) {
                    context += "\nEQUIPE DE PROFISSIONAIS:\n";
                    context += team.results.map(t => `- Nome: ${t.name} | E-mail: ${t.email}`).join('\n');
                    hasContext = true;
                }
            }
        }

        // 3. Histórico do Cliente (Novo!)
        if (userEmail && keywords.history.test(textLower)) {
            const history = await DB.prepare(`
                SELECT a.appointment_date, a.appointment_time, s.name as service_name, a.status 
                FROM appointments a 
                JOIN services s ON a.service_id = s.id 
                WHERE a.user_email = ? 
                ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT 3
            `).bind(userEmail).all();

            if (history.results?.length > 0) {
                context += "\nHISTÓRICO DO CLIENTE:\n";
                context += history.results.map(h => `- ${h.appointment_date} ${h.appointment_time}: ${h.service_name} [Status: ${h.status}]`).join('\n');
                hasContext = true;
            }
        }

        // 4. Informações de Disponibilidade Geral
        if (keywords.services.test(textLower)) {
            const avail = await DB.prepare(
                "SELECT day_of_week, start_time, end_time FROM availability WHERE barber_email = ?"
            ).bind(professionalEmail).all();

            if (avail.results?.length > 0) {
                const days = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
                context += "\nHORÁRIOS DE FUNCIONAMENTO:\n";
                context += avail.results.map(a => `- ${days[a.day_of_week]}: ${a.start_time} às ${a.end_time}`).join('\n');
                hasContext = true;
            }
        }

        // 5. Intenção Global (Master) para Faturamento ou Assinaturas
        if (isMaster && (textLower.includes("assinatura") || textLower.includes("faturamento") || textLower.includes("status"))) {
            const stats = await DB.prepare(
                "SELECT COUNT(*) as total_units FROM users WHERE is_admin = 1 AND owner_id IS NULL"
            ).first();
            context += `\nESTATÍSTICAS GLOBAIS:\n- Total de Unidades: ${stats.total_units}\n- Admin logado: ${professionalEmail}\n- Nota: Você pode gerenciar assinaturas e pontes de qualquer unidade listada acima.`;
            hasContext = true;
        }

        return hasContext ? context : "\n[AVISO]: Nenhum contexto específico injetado. Para agendar, verifique horários disponíveis.";
    } catch (error) {
        console.error("[RAG Error]", error.message);
        return "\n[ERRO]: Falha ao recuperar contexto do banco de dados.";
    }
}
