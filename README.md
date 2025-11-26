
# 🚛 Frete360
> **Controle total, sem complicação.**

![Version](https://img.shields.io/badge/version-1.2.21-blue.svg?style=for-the-badge)
![Stack](https://img.shields.io/badge/stack-React%20%7C%20Node.js%20%7C%20SQL%20Server-sky.svg?style=for-the-badge)
![Status](https://img.shields.io/badge/status-Private-red.svg?style=for-the-badge)

---

## 🚀 Sobre o Projeto

**Frete360** não é apenas uma planilha glorificada; é um ecossistema completo para gestão logística de fretes rodoviários. 

Desenvolvido para resolver a dor de cabeça de transportadoras que lidam com múltiplos veículos, cálculos complexos de impostos (Pedágio, Chapa, Taxas Ambientais) e a necessidade de conciliação com sistemas ERP legados. O sistema transforma dados brutos em inteligência financeira, permitindo saber exatamente o lucro por viagem, por motorista e por rota.

### 🎯 O Problema que Resolvemos
O caos das planilhas, a perda de comprovantes, o cálculo manual de pedágios e a falta de visibilidade sobre qual veículo está realmente dando lucro.

---

## ✨ Funcionalidades Principais

*   **📊 Dashboard Executivo:** Visão em tempo real de faturamento, custos e lucro líquido (KPIs).
*   **🚚 Gestão de Frota:** Controle total de veículos, motoristas e capacidades, com suporte a integração ERP.
*   **💰 Cálculo Automático de Fretes:** Motor de cálculo inteligente que considera cidade base, KM, valor CTE e taxas adicionais configuráveis.
*   **🔄 Sincronização ERP:** Importação e conciliação automática de Cargas e Veículos de bancos de dados externos (Legado).
*   **📄 Geração de Recibos:** Emissão de termos de aceite e recibos de pagamento para motoristas prontos para impressão.
*   **🛡️ Controle de Acesso:** Sistema robusto de autenticação e autorização (Admin vs Operador).
*   **⚙️ Parametrização Dinâmica:** Tabelas de preços e taxas editáveis pelo usuário administrativo.

---

## 🛠️ Tech Stack (A Tecnologia por trás da Máquina)

O projeto foi construído utilizando uma arquitetura moderna, desacoplada e containerizada.

### Frontend (Client-Side)
*   **Core:** React 18 + TypeScript (Tipagem estática para robustez).
*   **Estilização:** Tailwind CSS (Design System rápido e responsivo).
*   **State Management:** Context API (Gestão de estado global leve).
*   **Build Tool:** ESBuild (Compilação ultra-rápida).

### Backend (Server-Side)
*   **Runtime:** Node.js.
*   **Framework:** Express.js.
*   **Database Driver:** Tedious (Comunicação nativa com SQL Server).
*   **Auth:** JWT (JSON Web Tokens) + Bcrypt (Hashing de senhas).
*   **Documentation:** Swagger / OpenAPI 3.0.

### Infra & Dados
*   **Database:** Microsoft SQL Server.
*   **Container:** Docker & Docker Compose (Ambiente de desenvolvimento e produção idênticos).

---

## 📸 Previews

| Dashboard | Gestão de Cargas |
|:---:|:---:|
| *Visão geral de métricas* | *Filtros avançados e status* |
| ![DashIcon](https://img.icons8.com/fluency/48/null/bullish.png) | ![LoadIcon](https://img.icons8.com/fluency/48/null/box.png) |

---

## 🚀 Como Rodar (Quick Start)

Pré-requisitos: **Docker** e **Docker Compose**.

1.  **Clone o repositório**
    ```bash
    git clone https://github.com/henriquesergio1/Frete360.git
    cd Frete360
    ```

2.  **Configure o Ambiente**
    Crie um arquivo `.env` na pasta `api/` com as credenciais do banco (veja `api/.env.example`).

3.  **Suba os Containers**
    ```bash
    docker-compose up --build
    ```

4.  **Acesse**
    *   Frontend: `http://localhost:8080`
    *   API Docs: `http://localhost:3030/docs`

---

## 📂 Estrutura do Projeto

```text
frete360/
├── api/                 # Backend Node.js
│   ├── index.js         # Entry point e Rotas
│   ├── swaggerConfig.js # Documentação da API
│   └── Dockerfile       # Container da API
├── components/          # Componentes React (UI)
├── context/             # Lógica de Negócio Global
├── services/            # Camada de API Client
├── types.ts             # Definições de Tipos TypeScript
├── App.tsx              # Layout Principal
└── docker-compose.yml   # Orquestração
```

---

## 👨‍💻 Desenvolvedor

<div align="center">

**Sérgio Oliveira**

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/henrique-sergio/) 
[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/henriquesergio1)

*Construindo soluções que movem o mundo.*

</div>

---

## 🔒 Licença

Este projeto é software proprietário.
**Todos os direitos reservados.**

A cópia, modificação, distribuição ou uso não autorizado deste software, no todo ou em parte, é estritamente proibido.
