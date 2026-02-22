import { json, sendMessage } from '../utils/index.js';
import { REGISTRATION_PROMPTS } from './prompts.js';

export async function handleRegistrationFlow(from, text, textLower, session, env) {
    const isNumericChoice = /^\d+$/.test(text) && text.length <= 2;
    const botProfessionalEmail = "celsosilvajunior90@gmail.com"; // Admin email for registration bridge

    // Se não tem sessão, começa do zero
    if (!session || textLower === 'cadastro' || textLower === 'registrar') {
        await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, metadata) VALUES (?, "reg_awaiting_niche", "{}")').bind(from).run();
        await sendMessage(env, from, REGISTRATION_PROMPTS.welcome, botProfessionalEmail);
        return json({ success: true });
    }

    const metadata = JSON.parse(session.metadata || '{}');

    // 1. Escolha do Nicho
    if (session.state === 'reg_awaiting_niche' && isNumericChoice) {
        const niches = { '1': 'barbearia', '2': 'petshop', '3': 'salao', '4': 'clinica' };

        if (text === '5') {
            await env.DB.prepare('UPDATE whatsapp_sessions SET state = "reg_awaiting_custom_niche" WHERE phone = ?').run();
            await sendMessage(env, from, "Qual é o seu ramo de atuação? (Digite o nome do seu negócio)", botProfessionalEmail);
            return json({ success: true });
        }

        const nicheKey = niches[text] || 'default';
        metadata.business_type = nicheKey;

        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "reg_awaiting_plan", metadata = ? WHERE phone = ?').bind(JSON.stringify(metadata), from).run();
        await sendMessage(env, from, REGISTRATION_PROMPTS.choose_plan(nicheKey), botProfessionalEmail);
        return json({ success: true });
    }

    // 1.1 Nicho Customizado
    if (session.state === 'reg_awaiting_custom_niche') {
        metadata.business_type = textLower;
        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "reg_awaiting_plan", metadata = ? WHERE phone = ?').bind(JSON.stringify(metadata), from).run();
        await sendMessage(env, from, REGISTRATION_PROMPTS.choose_plan(textLower), botProfessionalEmail);
        return json({ success: true });
    }

    // 2. Escolha do Plano
    if (session.state === 'reg_awaiting_plan' && isNumericChoice) {
        const plans = { '1': 'Individual', '2': 'Standard', '3': 'Pro' };
        const plan = plans[text] || 'Individual';
        metadata.plan = plan;

        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "reg_awaiting_services", metadata = ? WHERE phone = ?').bind(JSON.stringify(metadata), from).run();
        await sendMessage(env, from, REGISTRATION_PROMPTS.setup_services, botProfessionalEmail);
        return json({ success: true });
    }

    // 3. Cadastro de Serviços
    if (session.state === 'reg_awaiting_services') {
        // Usar a AI para extrair serviços do texto do usuário
        const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
                { role: 'system', content: 'Você é um assistente de configuração. Sua tarefa é extrair uma lista de serviços e preços de um texto. Retorne APENAS um JSON no formato: [{"name": "Serviço", "price": 50.0}, ...]. Se não encontrar preço, use 0.' },
                { role: 'user', content: text }
            ]
        });

        try {
            const services = JSON.parse(aiResponse.response.match(/\[.*\]/s)[0]);
            metadata.parsed_services = services;
        } catch (e) {
            console.error('Falha ao parsear serviços', e);
            metadata.initial_services = text;
        }

        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "reg_awaiting_email", metadata = ? WHERE phone = ?').bind(JSON.stringify(metadata), from).run();
        await sendMessage(env, from, "Ótimo! Para finalizar seu perfil e criarmos seu painel, qual é o seu *e-mail profissional*?", botProfessionalEmail);
        return json({ success: true });
    }

    // 3.1 Captura de E-mail e Criação de Perfil
    if (session.state === 'reg_awaiting_email') {
        const email = text.toLowerCase().trim();
        if (!email.includes('@')) {
            await sendMessage(env, from, "Por favor, insira um e-mail válido.", botProfessionalEmail);
            return json({ success: true });
        }

        metadata.email = email;

        // 1. Criar o usuário no banco
        await env.DB.prepare(`
            INSERT OR IGNORE INTO users (email, name, phone, is_admin, is_barber, business_type, plan, shop_name)
            VALUES (?, ?, ?, 1, 1, ?, ?, ?)
        `).bind(email, `Profissional ${from}`, from, metadata.business_type, metadata.plan, `${metadata.business_type} do ${from}`).run();

        // 2. Inserir serviços parseados
        if (metadata.parsed_services) {
            for (const s of metadata.parsed_services) {
                const id = s.name.toLowerCase().replace(/\s+/g, '-');
                await env.DB.prepare('INSERT OR IGNORE INTO services (id, name, price, barber_email) VALUES (?, ?, ?, ?)').bind(`${id}-${Date.now()}`, s.name, s.price, email).run();
            }
        }

        await env.DB.prepare('UPDATE whatsapp_sessions SET state = "reg_awaiting_qr", metadata = ? WHERE phone = ?').bind(JSON.stringify(metadata), from).run();

        // Link para o QR Code (Exemplo: um subdomínio ou página de bridge)
        const qrLink = `https://universal-scheduler.pages.dev/connect?email=${email}`;

        await sendMessage(env, from, REGISTRATION_PROMPTS.qr_instructions + `\n\n🔗 *Link para o QR Code:* ${qrLink}`, botProfessionalEmail);
        return json({ success: true });
    }

    // 4. QR Code
    if (session.state === 'reg_awaiting_qr') {
        if (textLower === 'pronto' || textLower === 'ok') {
            await env.DB.prepare('DELETE FROM whatsapp_sessions WHERE phone = ?').bind(from).run();
            await sendMessage(env, from, REGISTRATION_PROMPTS.success, botProfessionalEmail);
            return json({ success: true });
        } else {
            // Se ele não digitou pronto, podemos reenviar o QR? 
            // Por enquanto só instruções.
            await sendMessage(env, from, "Quando terminar de escanear o QR Code, digite *PRONTO*.", botProfessionalEmail);
            return json({ success: true });
        }
    }

    return json({ error: "Fluxo não reconhecido" }, 400);
}
