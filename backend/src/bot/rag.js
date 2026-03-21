/**
 * RAG Layer - Retrieval-Augmented Generation for Universal Scheduler
 * Modernized Resource-Oriented Architecture with Request-Level Caching.
 */

// Simple In-Memory Cache (Short-lived per worker instance)
const RESOURCE_CACHE = new Map();
const CACHE_TTL = 30000; // 30 seconds

function getCached(resId, email, userEmail) {
    const key = `${resId}:${email}:${userEmail || ''}`;
    const entry = RESOURCE_CACHE.get(key);
    if (entry && (Date.now() - entry.timestamp < CACHE_TTL)) {
        return entry.data;
    }
    return null;
}

function setCached(resId, email, userEmail, data) {
    const key = `${resId}:${email}:${userEmail || ''}`;
    RESOURCE_CACHE.set(key, { data, timestamp: Date.now() });
    
    // Safety: prevent memory leak by capping cache size
    if (RESOURCE_CACHE.size > 200) {
        const firstKey = RESOURCE_CACHE.keys().next().value;
        RESOURCE_CACHE.delete(firstKey);
    }
}

/**
 * Identifies which resources are needed based on user message.
 */
export function identifyRequiredResources(userMessage, isMaster = false) {
    const textLower = userMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    const intentMap = {
        services: /(preco|quanto|servico|corte|faz|valor|horario|agenda|marcar|agendar|disponivel)/i,
        team: /(quem|atende|profissional|barbeiro|cabeleireiro|equipe|time|membro)/i,
        business: /(nome|onde|endereco|local|loja|estabelecimento|empresa|unidade|unidades)/i,
        history: /(meu|meus|agendamento|consulta|horario|marcado|agenda)/i
    };

    const resources = ['biz_profile']; // Profile is always useful

    if (intentMap.services.test(textLower)) {
        resources.push('biz_services', 'biz_availability');
    }
    if (intentMap.team.test(textLower) || (isMaster && intentMap.business.test(textLower))) {
        resources.push('biz_team');
        if (isMaster) resources.push('ecosystem_units');
    }
    if (intentMap.history.test(textLower)) {
        resources.push('client_history');
    }

    // Special Master Intents
    if (isMaster && (textLower.includes("assinatura") || textLower.includes("faturamento") || textLower.includes("status"))) {
        resources.push('global_stats');
    }

    return [...new Set(resources)];
}

/**
 * Resource Fetchers
 */
const Resolvers = {
    biz_profile: async (DB, email) => {
        const biz = await DB.prepare(
            "SELECT shop_name, business_type, bot_name, msg_welcome FROM users WHERE email = ?"
        ).bind(email).first();
        return biz ? `\nESTABELECIMENTO: ${biz.shop_name}\n- Nicho: ${biz.business_type}\n- Robô: ${biz.bot_name}\n` : "";
    },
    biz_services: async (DB, email) => {
        const res = await DB.prepare(
            "SELECT id, name, price, duration_minutes, description FROM services WHERE id != 'block' AND barber_email = ?"
        ).bind(email).all();
        if (!res.results?.length) return "";
        let out = "\nCATÁLOGO DE SERVIÇOS:\n";
        out += res.results.map(s => `- ID: ${s.id} | ${s.name}: R$ ${s.price} (${s.duration_minutes}min)${s.description ? ' - ' + s.description : ''}`).join('\n');
        return out;
    },
    biz_team: async (DB, email) => {
        const res = await DB.prepare(
            "SELECT name, email FROM users WHERE is_barber = 1 AND (owner_id = ? OR email = ?)"
        ).bind(email, email).all();
        if (!res.results?.length) return "";
        let out = "\nEQUIPE DE PROFISSIONAIS:\n";
        out += res.results.map(t => `- Nome: ${t.name} | E-mail: ${t.email}`).join('\n');
        return out;
    },
    client_history: async (DB, email, userEmail) => {
        if (!userEmail) return "";
        const res = await DB.prepare(`
            SELECT a.appointment_date, a.appointment_time, s.name as service_name, a.status 
            FROM appointments a 
            JOIN services s ON a.service_id = s.id 
            WHERE a.user_email = ? 
            ORDER BY a.appointment_date DESC LIMIT 3
        `).bind(userEmail).all();
        if (!res.results?.length) return "";
        let out = "\nHISTÓRICO DO CLIENTE:\n";
        out += res.results.map(h => `- ${h.appointment_date} ${h.appointment_time}: ${h.service_name} [${h.status}]`).join('\n');
        return out;
    },
    biz_availability: async (DB, email) => {
        const res = await DB.prepare(
            "SELECT day_of_week, start_time, end_time FROM availability WHERE barber_email = ?"
        ).bind(email).all();
        if (!res.results?.length) return "";
        const days = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
        let out = "\nHORÁRIOS DE FUNCIONAMENTO:\n";
        out += res.results.map(a => `- ${days[a.day_of_week]}: ${a.start_time} às ${a.end_time}`).join('\n');
        return out;
    },
    ecosystem_units: async (DB) => {
        const res = await DB.prepare(
            "SELECT name, email, wa_status FROM users WHERE is_admin = 1 AND owner_id IS NULL"
        ).all();
        if (!res.results?.length) return "";
        let out = "\nUNIDADES DO ECOSSISTEMA:\n";
        out += res.results.map(u => `- ${u.name} (${u.email}) [WP: ${u.wa_status || 'offline'}]`).join('\n');
        return out;
    },
    global_stats: async (DB) => {
        const stats = await DB.prepare("SELECT COUNT(*) as total FROM users WHERE is_admin = 1 AND owner_id IS NULL").first();
        return `\nESTATÍSTICAS GLOBAIS:\n- Total de Unidades: ${stats.total}\n`;
    }
};

/**
 * Main RAG Entry Point
 */
export async function getSmartContext(DB, userMessage, professionalEmail, userEmail = null) {
    try {
        const isMaster = professionalEmail === 'celsosilvajunior90@gmail.com';
        const needed = identifyRequiredResources(userMessage, isMaster);
        
        let finalContext = "\n[CONTEXTO DE NEGÓCIO ATUALIZADO]:\n";
        let hasData = false;

        const results = await Promise.all(needed.map(async (resId) => {
            if (!Resolvers[resId]) return "";
            
            // Check Cache
            const cached = getCached(resId, professionalEmail, userEmail);
            if (cached !== null) return cached;

            // Fetch & Cache
            const data = await Resolvers[resId](DB, professionalEmail, userEmail);
            setCached(resId, professionalEmail, userEmail, data);
            return data;
        }));

        const cleanResults = results.filter(r => r !== "");
        if (cleanResults.length > 0) {
            finalContext += cleanResults.join("\n");
            hasData = true;
        }

        return hasData ? finalContext : "\n[AVISO]: Contexto básico carregado. Verifique horários para agendamento.";
    } catch (error) {
        console.error("[RAG Error]", error.message);
        return "\n[ERRO]: Falha ao processar contexto dinâmico.";
    }
}
