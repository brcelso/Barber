/**
 * MCP Handler - Model Context Protocol Implementation
 * Standardizes access to tools and resources.
 */
import { TOOL_ACTIONS } from '../bot/toolActions.js';
import { getSmartContext } from '../bot/rag.js';

export const MCP_SERVER = {
    /**
     * List all available tools (standardized from agent.js)
     */
    async listTools() {
        return [
            { name: 'consultar_agenda', description: 'Consulta horários e ocupação da agenda.' },
            { name: 'agendar_cliente', description: 'Cria um novo agendamento.' },
            { name: 'alterar_status_agendamento', description: 'Atualiza o status (confirmado/cancelado).' },
            { name: 'consultar_faturamento', description: 'Calcula faturamento da unidade.' },
            { name: 'gerenciar_bloqueios', description: 'Bloqueia ou libera horários.' },
            { name: 'gerenciar_servicos', description: 'CRUD de serviços no catálogo.' },
            { name: 'gerenciar_equipe', description: 'Gestão de membros e permissões.' },
            { name: 'gerenciar_assinatura', description: 'Gestão de planos e validade.' },
            { name: 'gerenciar_robos', description: 'Controle de Bridge WhatsApp e IA.' },
            { name: 'ver_status_whatsapp', description: 'Verifica conexão do WhatsApp.' },
            { name: 'gerenciar_configuracoes', description: 'Altera dados da unidade/bot.' }
        ];
    },

    /**
     * Call a tool by name
     */
    async callTool(name, args, context) {
        const action = TOOL_ACTIONS[name];
        if (!action) throw new Error(`Tool ${name} not found`);

        const result = await action({
            args,
            DB: context.DB,
            env: context.env,
            emailReal: context.emailReal,
            professionalContext: context.professionalContext
        });

        return result;
    },

    /**
     * Get dynamic context (RAG) using the resource-oriented approach
     */
    async getContext(DB, userMessage, professionalEmail, userEmail) {
        return await getSmartContext(DB, userMessage, professionalEmail, userEmail);
    }
};
