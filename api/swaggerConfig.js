
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Fretes API',
      version: '1.2.0',
      description: 'Documentação da API do Sistema de Gestão de Fretes. Esta API gerencia veículos, cargas, parâmetros e lançamentos financeiros.',
    },
    servers: [
      {
        url: 'http://localhost:3030',
        description: 'Servidor de Produção',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Veiculo: {
          type: 'object',
          properties: {
            ID_Veiculo: { type: 'integer' },
            COD_Veiculo: { type: 'string' },
            Placa: { type: 'string' },
            Motorista: { type: 'string' },
            TipoVeiculo: { type: 'string' },
            CapacidadeKG: { type: 'integer' },
            Ativo: { type: 'boolean' }
          }
        },
        Carga: {
          type: 'object',
          properties: {
            ID_Carga: { type: 'integer' },
            NumeroCarga: { type: 'string' },
            Cidade: { type: 'string' },
            ValorCTE: { type: 'number' },
            DataCTE: { type: 'string', format: 'date' },
            COD_Veiculo: { type: 'string' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      { name: 'Autenticação', description: 'Gerenciamento de sessão' },
      { name: 'Veículos', description: 'Gestão da frota' },
      { name: 'Cargas', description: 'Gestão de cargas manuais e ERP' },
      { name: 'Lançamentos', description: 'Cálculo e registro de fretes' },
      { name: 'Parâmetros', description: 'Configuração de valores e taxas' }
    ],
    paths: {
      '/login': {
        post: {
          tags: ['Autenticação'],
          summary: 'Realiza login no sistema',
          security: [], // Endpoint público
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    usuario: { type: 'string', example: 'admin' },
                    senha: { type: 'string', example: 'admin' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Login realizado com sucesso' },
            401: { description: 'Credenciais inválidas' }
          }
        }
      },
      '/veiculos': {
        get: {
          tags: ['Veículos'],
          summary: 'Lista todos os veículos',
          responses: {
            200: { 
              description: 'Lista de veículos retornada',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Veiculo' } } } }
            }
          }
        },
        post: {
          tags: ['Veículos'],
          summary: 'Cria um novo veículo',
          requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Veiculo' } } } },
          responses: { 201: { description: 'Veículo criado' } }
        }
      },
      '/cargas-manuais': {
        get: {
          tags: ['Cargas'],
          summary: 'Lista cargas manuais e importadas',
          responses: {
            200: { 
              description: 'Lista de cargas',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Carga' } } } }
            }
          }
        },
        post: {
            tags: ['Cargas'],
            summary: 'Cria uma carga manual',
            requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Carga' } } } },
            responses: { 201: { description: 'Carga criada' } }
        }
      },
      '/lancamentos': {
        get: {
            tags: ['Lançamentos'],
            summary: 'Lista histórico de lançamentos de frete',
            responses: { 200: { description: 'Sucesso' } }
        },
        post: {
            tags: ['Lançamentos'],
            summary: 'Registra um novo cálculo de frete',
            description: 'Salva o lançamento e marca as cargas selecionadas como utilizadas.',
            responses: { 201: { description: 'Lançamento criado com sucesso' } }
        }
      },
      '/parametros-valores': {
          get: { tags: ['Parâmetros'], summary: 'Lista valores base por cidade/tipo' }
      },
      '/parametros-taxas': {
          get: { tags: ['Parâmetros'], summary: 'Lista taxas adicionais por cidade' }
      },
      '/veiculos-erp/check': {
          get: { tags: ['Veículos'], summary: 'Verifica divergências com o ERP' }
      },
      '/cargas-erp/check': {
          post: { tags: ['Cargas'], summary: 'Busca cargas no ERP por período' }
      }
    }
  },
  apis: [], // Não estamos usando anotações nos arquivos js para manter o código limpo, definimos tudo em 'paths' acima
};

module.exports = swaggerJsdoc(options);