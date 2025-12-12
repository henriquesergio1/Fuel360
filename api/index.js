
const express = require('express');
const cors = require('cors');
const { Request, Connection } = require('tedious');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mariadb = require('mariadb');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

const API_PORT = process.env.API_PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret-dev';

// --- CONFIGURAÇÃO BANCO LOCAL (FUEL360 - SQL Server Interno) ---
// Apenas as credenciais do banco principal do App ficam no ENV
const dbConfig = {
    server: process.env.DB_SERVER_FUEL360 || '10.10.10.100',
    authentication: {
        type: 'default',
        options: {
            userName: process.env.DB_USER_FUEL360 || 'sa',
            password: process.env.DB_PASSWORD_FUEL360 || 'senha'
        }
    },
    options: {
        database: process.env.DB_DATABASE_FUEL360 || 'Fuel360',
        encrypt: false,
        trustServerCertificate: true,
        rowCollectionOnRequestCompletion: true
    }
};

// Helper Genérico para Executar Queries Localmente (Fuel360)
function executeQuery(config, query, params = []) {
    return new Promise((resolve, reject) => {
        const connection = new Connection(config);
        
        connection.on('connect', err => {
            if (err) {
                console.error('Connection Failed (Local DB):', err);
                return reject(err);
            }
            
            const request = new Request(query, (err, rowCount) => {
                if (err) {
                    console.error('Query Failed:', err);
                    connection.close();
                    return reject(err);
                }
                connection.close();
            });

            params.forEach(p => {
                request.addParameter(p.name, p.type, p.value);
            });

            const rows = [];
            request.on('row', columns => {
                const row = {};
                columns.forEach(col => {
                    row[col.metadata.colName] = col.value;
                });
                rows.push(row);
            });

            request.on('requestCompleted', () => {
                resolve({ rows, rowCount: rows.length });
            });

            connection.execSql(request);
        });

        connection.connect();
    });
}

// Tipos do Tedious para Parâmetros
const TYPES = require('tedious').TYPES;

// --- AUTO-MIGRAÇÃO DE SCHEMA ---
async function ensureSchema() {
    console.log('Verificando integridade do banco de dados...');
    try {
        const query = `
            IF NOT EXISTS(SELECT * FROM sys.columns WHERE Name = N'ExtRoute_Host' AND Object_ID = Object_ID(N'SystemSettings'))
            BEGIN
                ALTER TABLE SystemSettings ADD 
                    ExtRoute_Host NVARCHAR(255),
                    ExtRoute_Port INT DEFAULT 1433,
                    ExtRoute_User NVARCHAR(100),
                    ExtRoute_Pass NVARCHAR(255),
                    ExtRoute_Database NVARCHAR(100),
                    ExtRoute_Query NVARCHAR(MAX);
                PRINT 'Colunas ExtRoute adicionadas com sucesso.';
            END
        `;
        await executeQuery(dbConfig, query);
        console.log('Schema verificado.');
    } catch (e) {
        console.error('Erro na verificação de schema:', e.message);
    }
}

// --- MIDDLEWARES ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(401);
        req.user = user;
        next();
    });
}

// --- ROTAS DE AUTENTICAÇÃO ---
app.post('/login', async (req, res) => {
    const { usuario, senha } = req.body;
    try {
        const query = `SELECT ID_Usuario, Nome, Usuario, SenhaHash, Perfil, Ativo FROM Usuarios WHERE Usuario = @usuario`;
        const params = [{ name: 'usuario', type: TYPES.NVarChar, value: usuario }];
        const { rows } = await executeQuery(dbConfig, query, params);

        if (rows.length === 0) return res.status(401).json({ message: "Usuário não encontrado" });
        const user = rows[0];

        if (!user.Ativo) return res.status(401).json({ message: "Usuário inativo" });

        let valid = false;
        if (user.SenhaHash.startsWith('$2a$')) {
            valid = await bcrypt.compare(senha, user.SenhaHash);
        } else {
            valid = (senha === user.SenhaHash);
        }

        if (!valid) return res.status(401).json({ message: "Senha incorreta" });

        const token = jwt.sign({ id: user.ID_Usuario, perfil: user.Perfil }, JWT_SECRET, { expiresIn: '12h' });
        delete user.SenhaHash;
        res.json({ token, user });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Erro interno no login" });
    }
});

// --- ROTAS DE SISTEMA / CONFIGURAÇÃO ---

// Status
app.get('/system/status', async (req, res) => {
    res.json({ status: 'ACTIVE', client: 'Fuel360 Enterprise', expiresAt: '2099-12-31' });
});

// Configuração Geral
app.get('/system/config', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT CompanyName as companyName, LogoUrl as logoUrl FROM SystemSettings WHERE ID = 1");
        res.json(rows[0] || {});
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.put('/system/config', authenticateToken, async (req, res) => {
    try {
        const { companyName, logoUrl } = req.body;
        const query = `UPDATE SystemSettings SET CompanyName = @c, LogoUrl = @l WHERE ID = 1`;
        await executeQuery(dbConfig, query, [
            { name: 'c', type: TYPES.NVarChar, value: companyName },
            { name: 'l', type: TYPES.NVarChar, value: logoUrl }
        ]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Configuração de Integração (GET) - Retorna os 2 bancos
app.get('/system/integration', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                ExtDb_Host, ExtDb_Port, ExtDb_User, ExtDb_Pass, ExtDb_Database, ExtDb_Query,
                ExtRoute_Host, ExtRoute_Port, ExtRoute_User, ExtRoute_Pass, ExtRoute_Database, ExtRoute_Query
            FROM SystemSettings WHERE ID = 1
        `;
        const { rows } = await executeQuery(dbConfig, query);
        const data = rows[0] || {};

        res.json({
            colab: {
                host: data.ExtDb_Host || '',
                port: data.ExtDb_Port || 3306,
                user: data.ExtDb_User || '',
                pass: data.ExtDb_Pass || '',
                database: data.ExtDb_Database || '',
                query: data.ExtDb_Query || '',
                type: 'MARIADB'
            },
            route: {
                host: data.ExtRoute_Host || '',
                port: data.ExtRoute_Port || 1433,
                user: data.ExtRoute_User || '',
                pass: data.ExtRoute_Pass || '',
                database: data.ExtRoute_Database || '',
                query: data.ExtRoute_Query || '',
                type: 'MSSQL'
            }
        });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Configuração de Integração (PUT) - Salva os 2 bancos
app.put('/system/integration', authenticateToken, async (req, res) => {
    try {
        const { colab, route } = req.body;
        
        await ensureSchema();

        const query = `
            UPDATE SystemSettings SET 
                ExtDb_Host = @ch, ExtDb_Port = @cp, ExtDb_User = @cu, ExtDb_Pass = @cpass, ExtDb_Database = @cd, ExtDb_Query = @cq,
                ExtRoute_Host = @rh, ExtRoute_Port = @rp, ExtRoute_User = @ru, ExtRoute_Pass = @rpass, ExtRoute_Database = @rd, ExtRoute_Query = @rq
            WHERE ID = 1
        `;
        
        const params = [
            // Colaboradores (MariaDB)
            { name: 'ch', type: TYPES.NVarChar, value: colab.host || '' },
            { name: 'cp', type: TYPES.Int, value: parseInt(colab.port) || 3306 },
            { name: 'cu', type: TYPES.NVarChar, value: colab.user || '' },
            { name: 'cpass', type: TYPES.NVarChar, value: colab.pass || '' },
            { name: 'cd', type: TYPES.NVarChar, value: colab.database || '' },
            { name: 'cq', type: TYPES.NVarChar, value: colab.query || '' },
            // Rota (SQL Server)
            { name: 'rh', type: TYPES.NVarChar, value: route.host || '' },
            { name: 'rp', type: TYPES.Int, value: parseInt(route.port) || 1433 },
            { name: 'ru', type: TYPES.NVarChar, value: route.user || '' },
            { name: 'rpass', type: TYPES.NVarChar, value: route.pass || '' },
            { name: 'rd', type: TYPES.NVarChar, value: route.database || '' },
            { name: 'rq', type: TYPES.NVarChar, value: route.query || '' }
        ];

        await executeQuery(dbConfig, query, params);
        res.json({ success: true, message: 'Configurações salvas com sucesso' });
    } catch (e) {
        console.error("Erro ao salvar integração:", e);
        res.status(500).json({ message: e.message || 'Erro interno ao salvar configurações.' });
    }
});

// --- IMPORT PREVIEW (MariaDB) ---
app.get('/colaboradores/import-preview', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT ExtDb_Host, ExtDb_Port, ExtDb_User, ExtDb_Pass, ExtDb_Database, ExtDb_Query FROM SystemSettings WHERE ID = 1");
        const config = rows[0];

        if (!config || !config.ExtDb_Host) {
            return res.json({ novos: [], alterados: [], conflitos: [], totalExternal: 0 });
        }

        const conn = await mariadb.createConnection({
            host: config.ExtDb_Host,
            port: config.ExtDb_Port,
            user: config.ExtDb_User,
            password: config.ExtDb_Pass,
            database: config.ExtDb_Database,
            connectTimeout: 5000
        });

        const externalRows = await conn.query(config.ExtDb_Query);
        conn.end();

        const { rows: localRows } = await executeQuery(dbConfig, "SELECT * FROM Colaboradores WHERE Ativo = 1");

        const novos = [];
        const alterados = [];
        const conflitos = [];

        externalRows.forEach(ext => {
            const local = localRows.find(l => l.ID_Pulsus == ext.id_pulsus);
            
            if (!local) {
                novos.push({
                    id_pulsus: ext.id_pulsus,
                    nome: ext.nome,
                    matchType: 'NEW',
                    newData: { codigo_setor: ext.codigo_setor, grupo: ext.grupo }
                });
            } else {
                const changes = [];
                if (String(local.CodigoSetor) !== String(ext.codigo_setor)) changes.push({ field: 'Setor', oldValue: local.CodigoSetor, newValue: ext.codigo_setor });
                
                if (changes.length > 0) {
                    alterados.push({
                        id_pulsus: ext.id_pulsus,
                        nome: ext.nome,
                        matchType: 'ID_MATCH',
                        existingColab: local,
                        changes,
                        newData: { codigo_setor: ext.codigo_setor, grupo: ext.grupo }
                    });
                }
            }
        });

        res.json({ novos, alterados, conflitos, totalExternal: externalRows.length });

    } catch (e) {
        console.error('Erro Import Preview (MariaDB):', e);
        res.json({ novos: [], alterados: [], conflitos: [], totalExternal: 0 });
    }
});

// --- ROTEIRIZADOR (SQL Server Externo) ---
app.get('/roteiro/previsao', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let dateStart = startDate;
        let dateEnd = endDate;

        if (!dateStart || !dateEnd) {
            const now = new Date();
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            dateStart = firstDay.toISOString().split('T')[0];
            dateEnd = lastDay.toISOString().split('T')[0];
        }

        const { rows: confRows } = await executeQuery(dbConfig, "SELECT ExtRoute_Host, ExtRoute_Port, ExtRoute_User, ExtRoute_Pass, ExtRoute_Database, ExtRoute_Query FROM SystemSettings WHERE ID = 1");
        const configData = confRows[0];

        if (!configData || !configData.ExtRoute_Host) {
            throw new Error("Configuração de banco de dados do Roteirizador não encontrada no Painel Admin.");
        }

        const externalRouteConfig = {
            server: configData.ExtRoute_Host,
            authentication: {
                type: 'default',
                options: {
                    userName: configData.ExtRoute_User,
                    password: configData.ExtRoute_Pass
                }
            },
            options: {
                database: configData.ExtRoute_Database,
                port: configData.ExtRoute_Port || 1433,
                encrypt: false,
                trustServerCertificate: true,
                rowCollectionOnRequestCompletion: true,
                requestTimeout: 60000
            }
        };

        const query = configData.ExtRoute_Query;
        
        if (!query) {
            throw new Error("Query SQL do Roteirizador não configurada.");
        }

        const params = [
            { name: 'pStartDate', type: TYPES.Date, value: dateStart },
            { name: 'pEndDate', type: TYPES.Date, value: dateEnd }
        ];

        const { rows } = await executeQuery(externalRouteConfig, query, params);
        res.json(rows);

    } catch (e) {
        console.error("Erro no roteirizador (SQL Externo):", e);
        res.status(500).json({ message: "Erro ao consultar servidor externo: " + e.message });
    }
});

// --- OUTRAS ROTAS PADRÃO ---

app.get('/colaboradores', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT * FROM Colaboradores WHERE Ativo = 1 ORDER BY Nome");
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/colaboradores', authenticateToken, async (req, res) => {
    try {
        const c = req.body;
        const query = `INSERT INTO Colaboradores (ID_Pulsus, CodigoSetor, Nome, Grupo, TipoVeiculo, Ativo, UsuarioCriacao) VALUES (@idp, @cod, @nome, @grp, @tpo, @atv, @usr); SELECT SCOPE_IDENTITY() as id;`;
        const params = [
            { name: 'idp', type: TYPES.Int, value: c.ID_Pulsus },
            { name: 'cod', type: TYPES.Int, value: c.CodigoSetor },
            { name: 'nome', type: TYPES.NVarChar, value: c.Nome },
            { name: 'grp', type: TYPES.NVarChar, value: c.Grupo },
            { name: 'tpo', type: TYPES.NVarChar, value: c.TipoVeiculo },
            { name: 'atv', type: TYPES.Bit, value: c.Ativo },
            { name: 'usr', type: TYPES.NVarChar, value: 'API' }
        ];
        const { rows } = await executeQuery(dbConfig, query, params);
        res.json({ ...c, ID_Colaborador: rows[0].id });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/colaboradores/:id', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;
        const c = req.body;
        const query = `UPDATE Colaboradores SET ID_Pulsus=@idp, CodigoSetor=@cod, Nome=@nome, Grupo=@grp, TipoVeiculo=@tpo, Ativo=@atv, UsuarioAlteracao=@usr, DataAlteracao=GETDATE(), MotivoAlteracao=@mtv WHERE ID_Colaborador = @id`;
        const params = [
            { name: 'idp', type: TYPES.Int, value: c.ID_Pulsus },
            { name: 'cod', type: TYPES.Int, value: c.CodigoSetor },
            { name: 'nome', type: TYPES.NVarChar, value: c.Nome },
            { name: 'grp', type: TYPES.NVarChar, value: c.Grupo },
            { name: 'tpo', type: TYPES.NVarChar, value: c.TipoVeiculo },
            { name: 'atv', type: TYPES.Bit, value: c.Ativo },
            { name: 'usr', type: TYPES.NVarChar, value: 'API' },
            { name: 'mtv', type: TYPES.NVarChar, value: c.MotivoAlteracao || 'Edição via Sistema' },
            { name: 'id', type: TYPES.Int, value: id }
        ];
        await executeQuery(dbConfig, query, params);
        res.json(c);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/config/fuel', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT * FROM ConfigReembolso WHERE ID = 1");
        res.json(rows[0] || {});
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/config/fuel', authenticateToken, async (req, res) => {
    try {
        const c = req.body;
        const query = `UPDATE ConfigReembolso SET PrecoCombustivel=@p, KmL_Carro=@kc, KmL_Moto=@km, UsuarioAlteracao=@usr, DataAlteracao=GETDATE(), MotivoAlteracao=@mtv WHERE ID = 1`;
        const params = [
            { name: 'p', type: TYPES.Decimal, value: c.PrecoCombustivel },
            { name: 'kc', type: TYPES.Decimal, value: c.KmL_Carro },
            { name: 'km', type: TYPES.Decimal, value: c.KmL_Moto },
            { name: 'usr', type: TYPES.NVarChar, value: 'API' },
            { name: 'mtv', type: TYPES.NVarChar, value: c.MotivoAlteracao }
        ];
        await executeQuery(dbConfig, query, params);
        await executeQuery(dbConfig, "INSERT INTO LogsSistema (Usuario, Acao, Detalhes) VALUES ('API', 'CONFIG_UPDATE', 'Atualização de parâmetros de combustível')");
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/config/fuel/history', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT TOP 10 * FROM LogsSistema WHERE Acao = 'CONFIG_UPDATE' ORDER BY DataHora DESC");
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/ausencias', authenticateToken, async (req, res) => {
    try {
        const query = `SELECT a.*, c.Nome as NomeColaborador, c.ID_Pulsus FROM ControleAusencias a INNER JOIN Colaboradores c ON a.ID_Colaborador = c.ID_Colaborador ORDER BY a.DataInicio DESC`;
        const { rows } = await executeQuery(dbConfig, query);
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/ausencias', authenticateToken, async (req, res) => {
    try {
        const a = req.body;
        const query = `INSERT INTO ControleAusencias (ID_Colaborador, DataInicio, DataFim, Motivo, UsuarioRegistro) VALUES (@idc, @di, @df, @mtv, @usr); SELECT SCOPE_IDENTITY() as id;`;
        const params = [
            { name: 'idc', type: TYPES.Int, value: a.ID_Colaborador },
            { name: 'di', type: TYPES.Date, value: a.DataInicio },
            { name: 'df', type: TYPES.Date, value: a.DataFim },
            { name: 'mtv', type: TYPES.NVarChar, value: a.Motivo },
            { name: 'usr', type: TYPES.NVarChar, value: 'API' }
        ];
        const { rows } = await executeQuery(dbConfig, query, params);
        res.json({ ...a, ID_Ausencia: rows[0].id });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/ausencias/:id', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;
        await executeQuery(dbConfig, "DELETE FROM ControleAusencias WHERE ID_Ausencia = @id", [{ name: 'id', type: TYPES.Int, value: id }]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/usuarios', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT ID_Usuario, Nome, Usuario, Perfil, Ativo FROM Usuarios ORDER BY Nome");
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/usuarios', authenticateToken, async (req, res) => {
    try {
        const { Nome, Usuario, Senha, Perfil, Ativo } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(Senha, salt);
        const query = `INSERT INTO Usuarios (Nome, Usuario, SenhaHash, Perfil, Ativo) VALUES (@n, @u, @s, @p, @a)`;
        const params = [
            { name: 'n', type: TYPES.NVarChar, value: Nome },
            { name: 'u', type: TYPES.NVarChar, value: Usuario },
            { name: 's', type: TYPES.NVarChar, value: hash },
            { name: 'p', type: TYPES.NVarChar, value: Perfil },
            { name: 'a', type: TYPES.Bit, value: Ativo }
        ];
        await executeQuery(dbConfig, query, params);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/usuarios/:id', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;
        const { Nome, Usuario, Senha, Perfil, Ativo } = req.body;
        let query = `UPDATE Usuarios SET Nome=@n, Usuario=@u, Perfil=@p, Ativo=@a`;
        const params = [
            { name: 'n', type: TYPES.NVarChar, value: Nome },
            { name: 'u', type: TYPES.NVarChar, value: Usuario },
            { name: 'p', type: TYPES.NVarChar, value: Perfil },
            { name: 'a', type: TYPES.Bit, value: Ativo },
            { name: 'id', type: TYPES.Int, value: id }
        ];
        if (Senha) {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(Senha, salt);
            query += `, SenhaHash=@s`;
            params.push({ name: 's', type: TYPES.NVarChar, value: hash });
        }
        query += ` WHERE ID_Usuario = @id`;
        await executeQuery(dbConfig, query, params);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Inicia Servidor e Verifica Schema
app.listen(API_PORT, async () => {
    console.log(`API Fuel360 rodando na porta ${API_PORT}`);
    await ensureSchema();
});
