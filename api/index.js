
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

// --- CONFIGURAÇÃO BANCO LOCAL (FUEL360) ---
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

// --- CONFIGURAÇÃO BANCO EXTERNO (FLEXX) ---
const flexxConfig = {
    server: process.env.DB_SERVER_FLEXX || 'consulta.flagcloud.com.br',
    authentication: {
        type: 'default',
        options: {
            userName: process.env.DB_USER_FLEXX || 'sa',
            password: process.env.DB_PASSWORD_FLEXX || 'senha'
        }
    },
    options: {
        database: process.env.DB_DATABASE_FLEXX || 'FLEXX10071188',
        encrypt: false, // Pode precisar ser true dependendo do servidor externo
        trustServerCertificate: true,
        rowCollectionOnRequestCompletion: true,
        requestTimeout: 60000 // Timeout maior para queries pesadas
    }
};

// Helper Genérico para Executar Queries
function executeQuery(config, query, params = []) {
    return new Promise((resolve, reject) => {
        const connection = new Connection(config);
        
        connection.on('connect', err => {
            if (err) {
                console.error('Connection Failed:', err);
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

        // Em produção, usar bcrypt.compare. Para dev/legado, verificação simples se não for hash
        let valid = false;
        if (user.SenhaHash.startsWith('$2a$')) {
            valid = await bcrypt.compare(senha, user.SenhaHash);
        } else {
            valid = (senha === user.SenhaHash); // Fallback temporário
        }

        if (!valid) return res.status(401).json({ message: "Senha incorreta" });

        const token = jwt.sign({ id: user.ID_Usuario, perfil: user.Perfil }, JWT_SECRET, { expiresIn: '12h' });
        
        // Remove hash antes de enviar
        delete user.SenhaHash;
        res.json({ token, user });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Erro interno no login" });
    }
});

// --- ROTAS DO SISTEMA ---
app.get('/system/status', async (req, res) => {
    // Health Check simples
    res.json({ status: 'ACTIVE', client: 'Fuel360 Enterprise', expiresAt: '2099-12-31' });
});

app.get('/system/config', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT CompanyName as companyName, LogoUrl as logoUrl FROM SystemSettings WHERE ID = 1");
        res.json(rows[0] || {});
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.get('/system/integration', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT ExtDb_Host, ExtDb_Port, ExtDb_User, ExtDb_Pass, ExtDb_Database, ExtDb_Query FROM SystemSettings WHERE ID = 1");
        // Ocultar senha
        // const data = rows[0] || {};
        // data.ExtDb_Pass = ''; 
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
        res.sendStatus(200);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// --- ROTAS DE COLABORADORES ---
app.get('/colaboradores', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT * FROM Colaboradores WHERE Ativo = 1 ORDER BY Nome");
        res.json(rows);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.post('/colaboradores', authenticateToken, async (req, res) => {
    try {
        const c = req.body;
        const query = `
            INSERT INTO Colaboradores (ID_Pulsus, CodigoSetor, Nome, Grupo, TipoVeiculo, Ativo, UsuarioCriacao)
            VALUES (@idp, @cod, @nome, @grp, @tpo, @atv, @usr);
            SELECT SCOPE_IDENTITY() as id;
        `;
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
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.put('/colaboradores/:id', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;
        const c = req.body;
        const query = `
            UPDATE Colaboradores SET 
                ID_Pulsus=@idp, CodigoSetor=@cod, Nome=@nome, Grupo=@grp, TipoVeiculo=@tpo, Ativo=@atv,
                UsuarioAlteracao=@usr, DataAlteracao=GETDATE(), MotivoAlteracao=@mtv
            WHERE ID_Colaborador = @id
        `;
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
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// --- ROTA DE CONFIGURAÇÃO DE COMBUSTÍVEL ---
app.get('/config/fuel', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT * FROM ConfigReembolso WHERE ID = 1");
        res.json(rows[0] || {});
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.put('/config/fuel', authenticateToken, async (req, res) => {
    try {
        const c = req.body;
        const query = `
            UPDATE ConfigReembolso SET 
                PrecoCombustivel=@p, KmL_Carro=@kc, KmL_Moto=@km,
                UsuarioAlteracao=@usr, DataAlteracao=GETDATE(), MotivoAlteracao=@mtv
            WHERE ID = 1
        `;
        const params = [
            { name: 'p', type: TYPES.Decimal, value: c.PrecoCombustivel },
            { name: 'kc', type: TYPES.Decimal, value: c.KmL_Carro },
            { name: 'km', type: TYPES.Decimal, value: c.KmL_Moto },
            { name: 'usr', type: TYPES.NVarChar, value: 'API' },
            { name: 'mtv', type: TYPES.NVarChar, value: c.MotivoAlteracao }
        ];
        await executeQuery(dbConfig, query, params);
        
        // Log
        await executeQuery(dbConfig, "INSERT INTO LogsSistema (Usuario, Acao, Detalhes) VALUES ('API', 'CONFIG_UPDATE', 'Atualização de parâmetros de combustível')");
        
        res.sendStatus(200);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.get('/config/fuel/history', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT TOP 10 * FROM LogsSistema WHERE Acao = 'CONFIG_UPDATE' ORDER BY DataHora DESC");
        res.json(rows);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// --- ROTAS DE AUSÊNCIAS ---
app.get('/ausencias', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT a.*, c.Nome as NomeColaborador, c.ID_Pulsus 
            FROM ControleAusencias a
            INNER JOIN Colaboradores c ON a.ID_Colaborador = c.ID_Colaborador
            ORDER BY a.DataInicio DESC
        `;
        const { rows } = await executeQuery(dbConfig, query);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.post('/ausencias', authenticateToken, async (req, res) => {
    try {
        const a = req.body;
        const query = `
            INSERT INTO ControleAusencias (ID_Colaborador, DataInicio, DataFim, Motivo, UsuarioRegistro)
            VALUES (@idc, @di, @df, @mtv, @usr);
            SELECT SCOPE_IDENTITY() as id;
        `;
        const params = [
            { name: 'idc', type: TYPES.Int, value: a.ID_Colaborador },
            { name: 'di', type: TYPES.Date, value: a.DataInicio },
            { name: 'df', type: TYPES.Date, value: a.DataFim },
            { name: 'mtv', type: TYPES.NVarChar, value: a.Motivo },
            { name: 'usr', type: TYPES.NVarChar, value: 'API' }
        ];
        const { rows } = await executeQuery(dbConfig, query, params);
        
        // Retorna o objeto criado enriquecido
        const newObj = { ...a, ID_Ausencia: rows[0].id };
        res.json(newObj);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.delete('/ausencias/:id', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;
        // Logar a exclusão seria ideal antes de deletar
        await executeQuery(dbConfig, "DELETE FROM ControleAusencias WHERE ID_Ausencia = @id", [{ name: 'id', type: TYPES.Int, value: id }]);
        res.sendStatus(200);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// --- ROTEIRIZADOR (CONSULTA BANCO EXTERNO FLEXX) ---
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

        // Esta query será executada no servidor FLEXX (consulta.flagcloud.com.br)
        // O banco default é o configurado em DB_DATABASE_FLEXX (FLEXX10071188)
        // Portanto, referências a tabelas do próprio banco não precisam de prefixo, mas manter o prefixo não quebra se o banco for o mesmo.
        
        const query = `
            DECLARE @DataInicio DATE = @pStartDate;
            DECLARE @DataFim DATE = @pEndDate;

            WITH DatasIntervalo AS (
                SELECT @DataInicio AS DataVisita
                UNION ALL
                SELECT DATEADD(DAY, 1, DataVisita)
                FROM DatasIntervalo
                WHERE DATEADD(DAY, 1, DataVisita) <= @DataFim
            ),
            DiasComInfo AS (
                SELECT 
                    d.DataVisita,
                    CASE 
                        WHEN DATEPART(WEEKDAY, d.DataVisita) = 1 THEN '7'
                        WHEN DATEPART(WEEKDAY, d.DataVisita) = 2 THEN '1'
                        WHEN DATEPART(WEEKDAY, d.DataVisita) = 3 THEN '2'
                        WHEN DATEPART(WEEKDAY, d.DataVisita) = 4 THEN '3'
                        WHEN DATEPART(WEEKDAY, d.DataVisita) = 5 THEN '4'
                        WHEN DATEPART(WEEKDAY, d.DataVisita) = 6 THEN '5'
                        WHEN DATEPART(WEEKDAY, d.DataVisita) = 7 THEN '6'
                    END AS DiaSemana
                FROM DatasIntervalo d
            )
            SELECT DISTINCT
                e.CODMTCEPGVDD AS 'Cod_Vend',
                epg.NOMEPG AS 'Nome_Vendedor',
                sbn.CODMTCEPGRPS AS 'Cod_Supervisor',
                sup.NOMEPG AS 'Nome_Supervisor',
                a.CODCET AS 'Cod_Cliente', 
                d.NOMRAZSCLCET AS 'Razão_Social', 
                CASE 
                    WHEN a.CODDIASMN = '1' THEN 'Segunda' 
                    WHEN a.CODDIASMN = '2' THEN 'Terca' 
                    WHEN a.CODDIASMN = '3' THEN 'Quarta' 
                    WHEN a.CODDIASMN = '4' THEN 'Quinta' 
                    WHEN a.CODDIASMN = '5' THEN 'Sexta' 
                    WHEN a.CODDIASMN = '6' THEN 'Sabado' 
                    WHEN a.CODDIASMN = '7' THEN 'Domingo'
                    ELSE 'SEM DIA CADASTRADO'
                END AS 'Dia_Semana',
                a.DESCCOVSTCET AS 'Periodicidade',
                x.DataVisita AS 'Data_da_Visita',
                g.deslgrcet AS 'Endereco',
                i.desbro AS 'Bairro',
                TRIM(h.descdd) AS 'Cidade',   
                g.codcepcet AS 'CEP',
                d.LATCET AS 'Lat',
                d.LONCET AS 'Long'
            FROM dbo.IBETVSTCET a
            INNER JOIN DiasComInfo x ON a.CODDIASMN = x.DiaSemana
            INNER JOIN dbo.IBETDATREFCCOVSTCET f 
                ON f.DATINICCOVSTCET <= x.DataVisita AND f.DATFIMCCOVSTCET >= x.DataVisita
                AND a.DESCCOVSTCET LIKE '%' + CAST(f.CODCCOVSTCET AS VARCHAR) + '%'
            INNER JOIN dbo.IBETCET d 
                ON a.CODCET = d.CODCET AND a.CODEMP = d.CODEMP
            INNER JOIN dbo.IBETPDRGPOCMZMRCCET e 
                ON a.CODEMP = e.CODEMP AND a.CODCET = e.CODCET AND a.CODGPOCMZMRC = e.CODGPOCMZMRC
            INNER JOIN dbo.IBETCPLEPG epg 
                ON epg.CODMTCEPG = e.CODMTCEPGVDD
            LEFT JOIN dbo.IBETSBN sbn 
                ON sbn.CODMTCEPGSBN = epg.CODMTCEPG
            LEFT JOIN dbo.IBETCPLEPG sup 
                ON sup.CODMTCEPG = sbn.CODMTCEPGRPS
            LEFT JOIN ibetedrcet g ON a.codcet = g.codcet AND codtpoedr = 1
            LEFT JOIN ibetcdd h ON g.codcdd = h.codcdd AND g.coduf_ = h.coduf_
            LEFT JOIN ibetbro i ON g.codbro = i.codbro AND h.coduf_ = i.coduf_ AND h.codcdd = i.codcdd
            WHERE d.TPOSTUCET = 'A' 
              AND e.CODMTCEPGVDD NOT IN (881,333,444,555,666,888,998,999)
            ORDER BY e.CODMTCEPGVDD, x.DataVisita
            OPTION (MAXRECURSION 1000);
        `;
        
        const params = [
            { name: 'pStartDate', type: TYPES.Date, value: dateStart },
            { name: 'pEndDate', type: TYPES.Date, value: dateEnd }
        ];

        // USA A CONFIG DO FLEXX AQUI
        const { rows } = await executeQuery(flexxConfig, query, params);
        res.json(rows);
    } catch (e) {
        console.error("Erro no roteirizador (Flexx):", e);
        res.status(500).json({ message: "Erro ao consultar servidor externo: " + e.message });
    }
});

// --- IMPORT PREVIEW (Integração MariaDB/MySQL Externo) ---
app.get('/colaboradores/import-preview', authenticateToken, async (req, res) => {
    try {
        // 1. Pega config do banco
        const { rows } = await executeQuery(dbConfig, "SELECT ExtDb_Host, ExtDb_Port, ExtDb_User, ExtDb_Pass, ExtDb_Database, ExtDb_Query FROM SystemSettings WHERE ID = 1");
        const config = rows[0];

        if (!config || !config.ExtDb_Host) {
            return res.json({ novos: [], alterados: [], conflitos: [], totalExternal: 0 });
        }

        // 2. Conecta no MariaDB/MySQL externo
        const conn = await mariadb.createConnection({
            host: config.ExtDb_Host,
            port: config.ExtDb_Port,
            user: config.ExtDb_User,
            password: config.ExtDb_Pass,
            database: config.ExtDb_Database
        });

        // 3. Executa Query
        const externalRows = await conn.query(config.ExtDb_Query);
        conn.end();

        // 4. Compara com banco local
        const { rows: localRows } = await executeQuery(dbConfig, "SELECT * FROM Colaboradores WHERE Ativo = 1");

        const novos = [];
        const alterados = [];
        const conflitos = [];

        // Lógica de comparação simplificada
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
                // Checa mudanças
                const changes = [];
                if (String(local.CodigoSetor) !== String(ext.codigo_setor)) changes.push({ field: 'Setor', oldValue: local.CodigoSetor, newValue: ext.codigo_setor });
                // ... mais comparações se necessário
                
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
        console.error('Erro Import Preview:', e);
        // Retorna array vazio em caso de erro de conexão para não travar o front
        res.json({ novos: [], alterados: [], conflitos: [], totalExternal: 0 });
    }
});

// Inicia Servidor
app.listen(API_PORT, () => {
    console.log(`API Fuel360 rodando na porta ${API_PORT}`);
});
