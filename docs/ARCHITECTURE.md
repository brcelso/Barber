# Project Architecture

The Universal Scheduler is modernized using a **Spec-Driven Development (SDD)** approach, integrating the **Model Context Protocol (MCP)** for AI orchestration and an **Enhanced RAG** layer for context.

## 1. Spec-Driven Development (SDD)
All technical interfaces and business rules are defined in the [SDD.md](../../SDD.md) at the root. This document serves as the single source of truth for:
- API Contracts.
- MCP Tool and Resource Definitions.
- Database Schema evolutions.

## 2. Model Context Protocol (MCP)
The system uses an internal MCP Server implementation (`backend/src/mcp/`) to abstract tool execution and resource retrieval.
- **Tools**: Standardized tools like `agendar_cliente` and `consultar_agenda`.
- **Resources**: Data points like `biz_profile` and `client_history` provided to the AI.

## 3. Enhanced RAG (Retrieval-Augmented Generation)
The RAG layer (`backend/src/bot/rag.js`) is resource-oriented:
- **Intelligent Intent Detection**: Maps user messages to required data resources.
- **Smart Caching**: Request-level caching to optimize Cloudflare D1 performance.
- **Parallel Retrieval**: Fetches multiple data points simultaneously for lower latency.

## 4. Ecosystem & Multitenancy
- **Master Manager**: Controlled by a master admin for global ecosystem oversight.
- **Shared infrastructure**: Multiple business units sharing the same Cloudflare D1 database with strict RBAC (Role-Based Access Control).
