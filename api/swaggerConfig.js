
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Fuel360 API',
      version: '1.4.5',
      description: 'API do Sistema de Gestão de Reembolso Fuel360.',
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
        Colaborador: {
          type: 'object',
          properties: {
            ID_Colaborador: { type: 'integer' },
            ID_Pulsus: { type: 'integer' },
            CodigoSetor: { type: 'integer' },
            Nome: { type: 'string' },
            Grupo: { type: 'string' },
            TipoVeiculo: { type: 'string' },
            Ativo: { type: 'boolean' }
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
      { name: 'Colaboradores', description: 'Gestão da equipe e setores' },
      { name: 'Cálculos', description: 'Processamento de reembolso' },
      { name: 'Relatórios', description: 'Consultas sintéticas e analíticas' },
      { name: 'Sistema', description: 'Parâmetros e Configurações' }
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
      '/colaboradores': {
        get: {
          tags: ['Colaboradores'],
          summary: 'Lista todos os colaboradores',
          responses: {
            200: { 
              description: 'Lista de colaboradores',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Colaborador' } } } }
            }
          }
        }
      }
    }
  },
  apis: [],
};

module.exports = swaggerJsdoc(options);
