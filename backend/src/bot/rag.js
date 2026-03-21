/**
 * RAG Layer - Retrieval-Augmented Generation for Universal Scheduler
 * Filtra dinamicamente o contexto baseado na intenção do usuário.
 */

export async function getSmartContext(DB, userMessage, professionalEmail) {
    const textLower = userMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Identificadores de intenção simples (Keywords - sem acentos após normalização)
    const keywords = {
        services: /(preco|quanto|servico|corte|faz|valor|horario|agenda|marcar|agendar|disponivel)/i,
        team: /(quem|atende|profissional|barbeiro|cabeleireiro|equipe|time|membro)/i,
        business: /(nome|onde|endereco|local|loja|estabelecimento|empresa)/i
    };

    let context = "\n[CONTEXTO DE NEGÓCIO SELECIONADO]:\n";
    let hasContext = false;

    try {
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

        // 2. Busca de Equipe (se necessário)
        if (keywords.team.test(textLower)) {
            const team = await DB.prepare(
                "SELECT name, email, business_type FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)"
            ).bind(professionalEmail, professionalEmail).all();

            if (team.results?.length > 0) {
                context += "\nEQUIPE DE PROFISSIONAIS:\n";
                context += team.results.map(t => `- Nome: ${t.name} | E-mail: ${t.email}`).join('\n');
                hasContext = true;
            }
        }

        // 3. Informações de Disponibilidade Geral (sempre útil em consultas de agenda)
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

        return hasContext ? context : "\n[AVISO]: Nenhum contexto específico injetado. Se precisar de preços ou equipe, pergunte claramente.";
    } catch (error) {
        console.error("[RAG Error]", error.message);
        return "\n[ERRO]: Falha ao recuperar contexto do banco de dados.";
    }
}
