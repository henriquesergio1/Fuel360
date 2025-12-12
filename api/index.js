

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
        rowCollectionOnRequestCompletion: true,
        requestTimeout: 30000
    }
};

const TYPES = require('tedious').TYPES;

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
                    // console.error('Query Failed:', err); // Verbose logging off
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

// --- AUTO-MIGRAÇÃO DE SCHEMA ---
async function ensureSchema() {
    console.log('Verificando integridade do banco de dados...');
    try {
        // Tabela SystemSettings e colunas externas
        const querySettings = `
            IF NOT EXISTS(SELECT * FROM sys.columns WHERE Name = N'ExtRoute_Host' AND Object_ID = Object_ID(N'SystemSettings'))
            BEGIN
                ALTER TABLE SystemSettings ADD 
                    ExtRoute_Host NVARCHAR(255),
                    ExtRoute_Port INT DEFAULT 1433,
                    ExtRoute_User NVARCHAR(100),
                    ExtRoute_Pass NVARCHAR(255),
                    ExtRoute_Database NVARCHAR(100),
                    ExtRoute_Query NVARCHAR(MAX);
            END
        `;
        await executeQuery(dbConfig, querySettings);

        // Tabelas de Histórico de Reembolso
        const queryHistory = `
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ReembolsoHistorico')
            BEGIN
                CREATE TABLE ReembolsoHistorico (
                    ID_Historico INT IDENTITY(1,1) PRIMARY KEY,
                    Periodo NVARCHAR(100),
                    DataFechamento DATETIME DEFAULT GETDATE(),
                    TotalGeral DECIMAL(18,2),
                    UsuarioFechamento NVARCHAR(100),
                    Observacao NVARCHAR(MAX)
                );
            END

            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ReembolsoDetalhe')
            BEGIN
                CREATE TABLE ReembolsoDetalhe (
                    ID_Detalhe INT IDENTITY(1,1) PRIMARY KEY,
                    ID_Historico INT FOREIGN KEY REFERENCES ReembolsoHistorico(ID_Historico) ON DELETE CASCADE,
                    ID_Colaborador INT,
                    ID_Pulsus INT,
                    NomeColaborador NVARCHAR(200),
                    Grupo NVARCHAR(100),
                    TipoVeiculo NVARCHAR(50),
                    TotalKM DECIMAL(18,2),
                    ValorReembolso DECIMAL(18,2),
                    ParametroPreco DECIMAL(10,2),
                    ParametroKmL DECIMAL(10,2)
                );
            END

            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ReembolsoDiario')
            BEGIN
                CREATE TABLE ReembolsoDiario (
                    ID_Diario INT IDENTITY(1,1) PRIMARY KEY,
                    ID_Detalhe INT FOREIGN KEY REFERENCES ReembolsoDetalhe(ID_Detalhe) ON DELETE CASCADE,
                    DataOcorrencia DATE,
                    KM_Dia DECIMAL(18,2),
                    Valor_Dia DECIMAL(18,2),
                    Observacao NVARCHAR(255)
                );
            END

            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LogsSistema')
            BEGIN
                CREATE TABLE LogsSistema (
                    ID_Log INT IDENTITY(1,1) PRIMARY KEY,
                    DataHora DATETIME DEFAULT GETDATE(),
                    Usuario NVARCHAR(100),
                    Acao NVARCHAR(100),
                    Detalhes NVARCHAR(MAX)
                );
            END
        `;
        await executeQuery(dbConfig, queryHistory);

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
app.get('/system/status', async (req, res) => {
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

app.get('/system/integration', authenticateToken, async (req, res) => {
    try {
        const query = `SELECT ExtDb_Host, ExtDb_Port, ExtDb_User, ExtDb_Pass, ExtDb_Database, ExtDb_Query, ExtRoute_Host, ExtRoute_Port, ExtRoute_User, ExtRoute_Pass, ExtRoute_Database, ExtRoute_Query FROM SystemSettings WHERE ID = 1`;
        const { rows } = await executeQuery(dbConfig, query);
        const data = rows[0] || {};
        res.json({
            colab: { host: data.ExtDb_Host, port: data.ExtDb_Port, user: data.ExtDb_User, pass: data.ExtDb_Pass, database: data.ExtDb_Database, query: data.ExtDb_Query, type: 'MARIADB' },
            route: { host: data.ExtRoute_Host, port: data.ExtRoute_Port, user: data.ExtRoute_User, pass: data.ExtRoute_Pass, database: data.ExtRoute_Database, query: data.ExtRoute_Query, type: 'MSSQL' }
        });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/system/integration', authenticateToken, async (req, res) => {
    try {
        const { colab, route } = req.body;
        await ensureSchema();
        const query = `UPDATE SystemSettings SET ExtDb_Host=@ch, ExtDb_Port=@cp, ExtDb_User=@cu, ExtDb_Pass=@cpass, ExtDb_Database=@cd, ExtDb_Query=@cq, ExtRoute_Host=@rh, ExtRoute_Port=@rp, ExtRoute_User=@ru, ExtRoute_Pass=@rpass, ExtRoute_Database=@rd, ExtRoute_Query=@rq WHERE ID = 1`;
        const params = [
            { name: 'ch', type: TYPES.NVarChar, value: colab.host }, { name: 'cp', type: TYPES.Int, value: colab.port }, { name: 'cu', type: TYPES.NVarChar, value: colab.user }, { name: 'cpass', type: TYPES.NVarChar, value: colab.pass }, { name: 'cd', type: TYPES.NVarChar, value: colab.database }, { name: 'cq', type: TYPES.NVarChar, value: colab.query },
            { name: 'rh', type: TYPES.NVarChar, value: route.host }, { name: 'rp', type: TYPES.Int, value: route.port }, { name: 'ru', type: TYPES.NVarChar, value: route.user }, { name: 'rpass', type: TYPES.NVarChar, value: route.pass }, { name: 'rd', type: TYPES.NVarChar, value: route.database }, { name: 'rq', type: TYPES.NVarChar, value: route.query }
        ];
        await executeQuery(dbConfig, query, params);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/system/test-connection', authenticateToken, async (req, res) => {
    const { config } = req.body;
    if (!config || !config.host) return res.status(400).json({ success: false, message: 'Configuração inválida.' });
    try {
        if (config.type === 'MARIADB') {
            const conn = await mariadb.createConnection({ host: config.host, port: parseInt(config.port) || 3306, user: config.user, password: config.pass, database: config.database, connectTimeout: 5000 });
            await conn.query("SELECT 1"); await conn.end();
            res.json({ success: true, message: 'Conexão MariaDB OK!' });
        } else if (config.type === 'MSSQL') {
             const testConfig = { server: config.host, authentication: { type: 'default', options: { userName: config.user, password: config.pass } }, options: { database: config.database, port: parseInt(config.port) || 1433, encrypt: false, trustServerCertificate: true, connectTimeout: 5000 } };
            await executeQuery(testConfig, "SELECT 1");
            res.json({ success: true, message: 'Conexão SQL Server OK!' });
        } else { res.status(400).json({ success: false, message: 'Tipo desconhecido.' }); }
    } catch (e) { res.json({ success: false, message: e.message }); }
});

// --- IMPORT & SYNC ---
app.get('/colaboradores/import-preview', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT ExtDb_Host, ExtDb_Port, ExtDb_User, ExtDb_Pass, ExtDb_Database, ExtDb_Query FROM SystemSettings WHERE ID = 1");
        const config = rows[0];
        if (!config || !config.ExtDb_Host) throw new Error("Configuração externa não encontrada.");

        const conn = await mariadb.createConnection({ host: config.ExtDb_Host, port: config.ExtDb_Port, user: config.ExtDb_User, password: config.ExtDb_Pass, database: config.ExtDb_Database, connectTimeout: 5000 });
        let externalRows = await conn.query(config.ExtDb_Query);
        conn.end();

        externalRows = JSON.parse(JSON.stringify(externalRows, (key, value) => typeof value === 'bigint' ? value.toString() : value));

        const { rows: localRows } = await executeQuery(dbConfig, "SELECT * FROM Colaboradores WHERE Ativo = 1");
        const novos = [], alterados = [], conflitos = [];

        externalRows.forEach(ext => {
            const getId = (o) => o.id_pulsus || o.ID_PULSUS || o.id || o.ID;
            const getName = (o) => o.nome || o.NOME || o.name || o.NAME;
            const getSector = (o) => o.codigo_setor || o.CODIGO_SETOR || o.setor || o.SETOR;
            const getGroup = (o) => o.grupo || o.GRUPO || o.cargo || o.CARGO;

            const extId = parseInt(getId(ext));
            const extName = getName(ext);
            const extSector = parseInt(getSector(ext)) || 0;
            const extGroup = getGroup(ext) || 'Vendedor';

            if (!extId || !extName) return;

            const local = localRows.find(l => l.ID_Pulsus === extId);
            
            // Verifica conflito de setor (Mesmo setor, nome diferente = possível troca de aparelho com novo ID)
            const sectorConflict = !local && localRows.find(l => l.CodigoSetor === extSector && l.Grupo === extGroup);

            if (!local) {
                if (sectorConflict) {
                    conflitos.push({ id_pulsus: extId, nome: extName, matchType: 'SECTOR_CONFLICT', existingColab: sectorConflict, newData: { codigo_setor: extSector, grupo: extGroup } });
                } else {
                    novos.push({ id_pulsus: extId, nome: extName, matchType: 'NEW', newData: { codigo_setor: extSector, grupo: extGroup } });
                }
            } else {
                if (local.CodigoSetor !== extSector) {
                    alterados.push({ id_pulsus: extId, nome: extName, matchType: 'ID_MATCH', existingColab: local, changes: [{field:'Setor', oldValue: local.CodigoSetor, newValue: extSector}], newData: { codigo_setor: extSector, grupo: extGroup } });
                }
            }
        });

        res.json({ novos, alterados, conflitos, totalExternal: externalRows.length });
    } catch (e) { res.status(500).json({ message: "Erro importação: " + e.message }); }
});

app.post('/colaboradores/sync', authenticateToken, async (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ message: "Dados inválidos" });

    let count = 0;
    const errors = [];

    for (const item of items) {
        try {
            if (item.syncAction === 'INSERT') {
                const query = `
                    IF NOT EXISTS (SELECT 1 FROM Colaboradores WHERE ID_Pulsus = @idp)
                    BEGIN
                        INSERT INTO Colaboradores (ID_Pulsus, CodigoSetor, Nome, Grupo, TipoVeiculo, Ativo, UsuarioCriacao)
                        VALUES (@idp, @cod, @nome, @grp, 'Carro', 1, 'API_SYNC')
                    END
                `;
                await executeQuery(dbConfig, query, [
                    { name: 'idp', type: TYPES.Int, value: item.id_pulsus },
                    { name: 'cod', type: TYPES.Int, value: item.newData.codigo_setor },
                    { name: 'nome', type: TYPES.NVarChar, value: item.nome },
                    { name: 'grp', type: TYPES.NVarChar, value: item.newData.grupo || 'Vendedor' }
                ]);
                count++;
            } else if (item.syncAction === 'UPDATE_DATA') {
                const query = `UPDATE Colaboradores SET CodigoSetor=@cod, Grupo=@grp, DataAlteracao=GETDATE(), MotivoAlteracao='Sincronização' WHERE ID_Pulsus=@idp`;
                await executeQuery(dbConfig, query, [
                    { name: 'cod', type: TYPES.Int, value: item.newData.codigo_setor },
                    { name: 'grp', type: TYPES.NVarChar, value: item.newData.grupo || 'Vendedor' },
                    { name: 'idp', type: TYPES.Int, value: item.id_pulsus }
                ]);
                count++;
            } else if (item.syncAction === 'UPDATE_ID' && item.existingColab) {
                // Atualiza o ID Pulsus do colaborador existente (Troca de Aparelho)
                const query = `UPDATE Colaboradores SET ID_Pulsus=@newId, DataAlteracao=GETDATE(), MotivoAlteracao='Sync: Troca ID' WHERE ID_Colaborador=@localId`;
                await executeQuery(dbConfig, query, [
                    { name: 'newId', type: TYPES.Int, value: item.id_pulsus },
                    { name: 'localId', type: TYPES.Int, value: item.existingColab.ID_Colaborador }
                ]);
                count++;
            }
        } catch (e) { errors.push({ id: item.id_pulsus, error: e.message }); }
    }
    res.json({ success: true, count, errors });
});

// --- GESTÃO COLABORADORES ---
app.get('/colaboradores', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT * FROM Colaboradores WHERE Ativo = 1 ORDER BY Nome");
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/colaboradores', authenticateToken, async (req, res) => {
    try {
        const c = req.body;
        const query = `INSERT INTO Colaboradores (ID_Pulsus, CodigoSetor, Nome, Grupo, TipoVeiculo, Ativo, UsuarioCriacao) VALUES (@idp, @cod, @nome, @grp, @tpo, @atv, 'API'); SELECT SCOPE_IDENTITY() as id;`;
        const params = [
            { name: 'idp', type: TYPES.Int, value: c.ID_Pulsus },
            { name: 'cod', type: TYPES.Int, value: c.CodigoSetor },
            { name: 'nome', type: TYPES.NVarChar, value: c.Nome },
            { name: 'grp', type: TYPES.NVarChar, value: c.Grupo },
            { name: 'tpo', type: TYPES.NVarChar, value: c.TipoVeiculo },
            { name: 'atv', type: TYPES.Bit, value: c.Ativo }
        ];
        const { rows } = await executeQuery(dbConfig, query, params);
        res.json({ ...c, ID_Colaborador: rows[0].id });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/colaboradores/:id', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;
        const c = req.body;
        const query = `UPDATE Colaboradores SET ID_Pulsus=@idp, CodigoSetor=@cod, Nome=@nome, Grupo=@grp, TipoVeiculo=@tpo, Ativo=@atv, UsuarioAlteracao='API', DataAlteracao=GETDATE(), MotivoAlteracao=@mtv WHERE ID_Colaborador = @id`;
        const params = [
            { name: 'idp', type: TYPES.Int, value: c.ID_Pulsus },
            { name: 'cod', type: TYPES.Int, value: c.CodigoSetor },
            { name: 'nome', type: TYPES.NVarChar, value: c.Nome },
            { name: 'grp', type: TYPES.NVarChar, value: c.Grupo },
            { name: 'tpo', type: TYPES.NVarChar, value: c.TipoVeiculo },
            { name: 'atv', type: TYPES.Bit, value: c.Ativo },
            { name: 'mtv', type: TYPES.NVarChar, value: c.MotivoAlteracao || 'Edição' },
            { name: 'id', type: TYPES.Int, value: id }
        ];
        await executeQuery(dbConfig, query, params);
        res.json(c);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/colaboradores/:id', authenticateToken, async (req, res) => {
    try {
        await executeQuery(dbConfig, "UPDATE Colaboradores SET Ativo = 0, MotivoAlteracao = 'Excluído' WHERE ID_Colaborador = @id", [{name: 'id', type: TYPES.Int, value: req.params.id}]);
        res.json({success: true});
    } catch(e) { res.status(500).json({message: e.message}); }
});

app.post('/colaboradores/move', authenticateToken, async (req, res) => {
    const { ids, group } = req.body;
    for (const id of ids) {
        await executeQuery(dbConfig, "UPDATE Colaboradores SET Grupo = @g, MotivoAlteracao='Mover Grupo' WHERE ID_Colaborador = @id", [
            { name: 'g', type: TYPES.NVarChar, value: group },
            { name: 'id', type: TYPES.Int, value: id }
        ]);
    }
    res.json({ success: true });
});

app.post('/colaboradores/bulk-update', authenticateToken, async (req, res) => {
    const { ids, field, value, reason } = req.body;
    let sqlField = '', sqlType = TYPES.NVarChar;
    if (field === 'TipoVeiculo') sqlField = 'TipoVeiculo';
    else if (field === 'Ativo') { sqlField = 'Ativo'; sqlType = TYPES.Bit; }
    else return res.status(400).json({message: 'Campo inválido'});

    for (const id of ids) {
        await executeQuery(dbConfig, `UPDATE Colaboradores SET ${sqlField} = @val, MotivoAlteracao = @rea, DataAlteracao = GETDATE() WHERE ID_Colaborador = @id`, [
            { name: 'val', type: sqlType, value: value },
            { name: 'rea', type: TYPES.NVarChar, value: reason },
            { name: 'id', type: TYPES.Int, value: id }
        ]);
    }
    res.json({ success: true });
});

app.post('/colaboradores/suggestions', authenticateToken, async (req, res) => {
    // Retorna vazio por enquanto, lógica complexa de histórico
    res.json([]);
});

// --- CÁLCULO & RELATÓRIOS ---
app.post('/calculo', authenticateToken, async (req, res) => {
    const { Periodo, TotalGeral, MotivoOverwrite, Itens } = req.body;
    
    // Inserir Histórico Header
    const qHead = `INSERT INTO ReembolsoHistorico (Periodo, TotalGeral, UsuarioFechamento, Observacao) VALUES (@p, @t, 'API', @obs); SELECT SCOPE_IDENTITY() as id;`;
    const { rows } = await executeQuery(dbConfig, qHead, [
        { name: 'p', type: TYPES.NVarChar, value: Periodo },
        { name: 't', type: TYPES.Decimal, value: TotalGeral },
        { name: 'obs', type: TYPES.NVarChar, value: MotivoOverwrite || '' }
    ]);
    const histId = rows[0].id;

    // Inserir Detalhes e Diários
    for (const item of Itens) {
        const qDet = `INSERT INTO ReembolsoDetalhe (ID_Historico, ID_Colaborador, ID_Pulsus, NomeColaborador, Grupo, TipoVeiculo, TotalKM, ValorReembolso, ParametroPreco, ParametroKmL) VALUES (@hid, 0, @idp, @nome, @grp, @tpo, @tkm, @val, @pp, @pk); SELECT SCOPE_IDENTITY() as id;`;
        const { rows: detRows } = await executeQuery(dbConfig, qDet, [
            { name: 'hid', type: TYPES.Int, value: histId },
            { name: 'idp', type: TYPES.Int, value: item.ID_Pulsus },
            { name: 'nome', type: TYPES.NVarChar, value: item.Nome },
            { name: 'grp', type: TYPES.NVarChar, value: item.Grupo },
            { name: 'tpo', type: TYPES.NVarChar, value: item.TipoVeiculo },
            { name: 'tkm', type: TYPES.Decimal, value: item.TotalKM },
            { name: 'val', type: TYPES.Decimal, value: item.ValorReembolso },
            { name: 'pp', type: TYPES.Decimal, value: item.ParametroPreco },
            { name: 'pk', type: TYPES.Decimal, value: item.ParametroKmL }
        ]);
        const detId = detRows[0].id;

        for (const dia of item.RegistrosDiarios) {
            const qDia = `INSERT INTO ReembolsoDiario (ID_Detalhe, DataOcorrencia, KM_Dia, Valor_Dia, Observacao) VALUES (@did, @dt, @km, @v, @obs)`;
            await executeQuery(dbConfig, qDia, [
                { name: 'did', type: TYPES.Int, value: detId },
                { name: 'dt', type: TYPES.Date, value: dia.Data },
                { name: 'km', type: TYPES.Decimal, value: dia.KM },
                { name: 'v', type: TYPES.Decimal, value: dia.Valor },
                { name: 'obs', type: TYPES.NVarChar, value: dia.Observacao || '' }
            ]);
        }
    }
    res.json({ success: true });
});

app.get('/calculo/exists', authenticateToken, async (req, res) => {
    const { periodo } = req.query;
    const { rows } = await executeQuery(dbConfig, "SELECT COUNT(*) as c FROM ReembolsoHistorico WHERE Periodo = @p", [{name:'p', type:TYPES.NVarChar, value: periodo}]);
    res.json(rows[0].c > 0);
});

app.get('/relatorios/reembolso', authenticateToken, async (req, res) => {
    const { startDate, endDate, colab, group } = req.query;
    // Consulta simplificada pegando do detalhe
    let q = `SELECT d.*, h.DataFechamento as DataGeracao, h.Periodo as PeriodoReferencia FROM ReembolsoDetalhe d INNER JOIN ReembolsoHistorico h ON d.ID_Historico = h.ID_Historico WHERE h.DataFechamento BETWEEN @sd AND @ed`;
    const p = [
        {name:'sd', type:TYPES.Date, value: startDate},
        {name:'ed', type:TYPES.Date, value: endDate + ' 23:59:59'}
    ];
    if (colab) { q += ` AND d.ID_Pulsus = @c`; p.push({name:'c', type:TYPES.Int, value: colab}); }
    if (group) { q += ` AND d.Grupo = @g`; p.push({name:'g', type:TYPES.NVarChar, value: group}); }
    
    const { rows } = await executeQuery(dbConfig, q, p);
    res.json(rows);
});

app.get('/relatorios/analitico', authenticateToken, async (req, res) => {
    const { startDate, endDate, colab, group } = req.query;
    let q = `SELECT dia.*, d.ID_Pulsus, d.NomeColaborador, d.Grupo, d.TipoVeiculo, h.DataFechamento as DataGeracao, h.Periodo as PeriodoReferencia FROM ReembolsoDiario dia INNER JOIN ReembolsoDetalhe d ON dia.ID_Detalhe = d.ID_Detalhe INNER JOIN ReembolsoHistorico h ON d.ID_Historico = h.ID_Historico WHERE h.DataFechamento BETWEEN @sd AND @ed`;
    const p = [
        {name:'sd', type:TYPES.Date, value: startDate},
        {name:'ed', type:TYPES.Date, value: endDate + ' 23:59:59'}
    ];
    if (colab) { q += ` AND d.ID_Pulsus = @c`; p.push({name:'c', type:TYPES.Int, value: colab}); }
    if (group) { q += ` AND d.Grupo = @g`; p.push({name:'g', type:TYPES.NVarChar, value: group}); }
    
    const { rows } = await executeQuery(dbConfig, q, p);
    res.json(rows);
});

app.post('/logs', authenticateToken, async (req, res) => {
    const { acao, detalhes } = req.body;
    await executeQuery(dbConfig, "INSERT INTO LogsSistema (Usuario, Acao, Detalhes) VALUES ('API', @a, @d)", [
        {name:'a', type:TYPES.NVarChar, value: acao},
        {name:'d', type:TYPES.NVarChar, value: detalhes}
    ]);
    res.json({success:true});
});

app.post('/ausencias/fix-history', authenticateToken, async (req, res) => {
    const { ids } = req.body; // IDs de ReembolsoDiario para zerar
    for (const id of ids) {
        await executeQuery(dbConfig, "UPDATE ReembolsoDiario SET Valor_Dia = 0, Observacao = CONCAT(Observacao, ' [CORRIGIDO: AUSENCIA]') WHERE ID_Diario = @id", [{name:'id', type:TYPES.Int, value:id}]);
    }
    res.json({success:true});
});

// --- ROTEIRIZADOR (SQL Server Externo) ---
app.get('/roteiro/previsao', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let dateStart = startDate;
        let dateEnd = endDate;

        if (!dateStart || !dateEnd) {
            const now = new Date();
            dateStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            dateEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        }

        const { rows: confRows } = await executeQuery(dbConfig, "SELECT ExtRoute_Host, ExtRoute_Port, ExtRoute_User, ExtRoute_Pass, ExtRoute_Database, ExtRoute_Query FROM SystemSettings WHERE ID = 1");
        const configData = confRows[0];

        if (!configData || !configData.ExtRoute_Host) throw new Error("Configuração roteirizador incompleta.");

        const externalRouteConfig = {
            server: configData.ExtRoute_Host,
            authentication: { type: 'default', options: { userName: configData.ExtRoute_User, password: configData.ExtRoute_Pass } },
            options: { database: configData.ExtRoute_Database, port: configData.ExtRoute_Port || 1433, encrypt: false, trustServerCertificate: true, rowCollectionOnRequestCompletion: true, requestTimeout: 60000 }
        };

        const params = [
            { name: 'pStartDate', type: TYPES.Date, value: dateStart },
            { name: 'pEndDate', type: TYPES.Date, value: dateEnd }
        ];

        const { rows } = await executeQuery(externalRouteConfig, configData.ExtRoute_Query, params);
        
        // Mapeamento de Colunas (Case Insensitive e Aliases Comuns)
        const mappedRows = rows.map(r => {
            const getVal = (candidates) => {
                for (const key of Object.keys(r)) {
                    if (candidates.includes(key.toUpperCase())) return r[key];
                }
                return null;
            };

            return {
                Cod_Vend: getVal(['COD_VEND', 'ID_VENDEDOR', 'VENDEDOR_ID', 'COD. VEND']) || 0,
                Nome_Vendedor: getVal(['NOME_VENDEDOR', 'VENDEDOR', 'NOME', 'NOME VENDEDOR']) || 'Desconhecido',
                Cod_Supervisor: getVal(['COD_SUPERVISOR', 'ID_SUPERVISOR', 'COD. SUPERVISOR']) || 0,
                Nome_Supervisor: getVal(['NOME_SUPERVISOR', 'SUPERVISOR', 'NOME SUPERVISOR']) || '',
                Cod_Cliente: getVal(['COD_CLIENTE', 'ID_CLIENTE', 'CLIENTE_ID', 'COD. CLIENTE']) || 0,
                Razao_Social: getVal(['RAZAO_SOCIAL', 'CLIENTE', 'NOME_FANTASIA', 'NOME_CLIENTE', 'RAZÃO SOCIAL', 'RAZAO SOCIAL']) || 'Cliente',
                Dia_Semana: getVal(['DIA_SEMANA', 'DIA', 'DIA SEMANA']) || '',
                Periodicidade: getVal(['PERIODICIDADE']) || '',
                // Tratamento de Data seguro para serialização JSON
                Data_da_Visita: (() => {
                    const raw = getVal(['DATA_DA_VISITA', 'DATA', 'DT_VISITA', 'DATA_VISITA', 'DATA DA VISITA']);
                    if (raw instanceof Date) {
                        return isNaN(raw.getTime()) ? null : raw;
                    }
                    if (typeof raw === 'string') {
                        // Tenta converter string para data para validação
                        const d = new Date(raw);
                        return isNaN(d.getTime()) ? null : d;
                    }
                    return raw;
                })(),
                Endereco: getVal(['ENDERECO', 'LOGRADOURO']) || '',
                Bairro: getVal(['BAIRRO']) || '',
                Cidade: getVal(['CIDADE', 'MUNICIPIO']) || '',
                CEP: getVal(['CEP']) || '',
                // Força float para garantir que o Leaflet não receba string
                Lat: parseFloat(getVal(['LAT', 'LATITUDE'])) || 0,
                Long: parseFloat(getVal(['LONG', 'LONGITUDE', 'LNG'])) || 0
            };
        });

        // Filtro de Segurança (Backend Side)
        const filteredRows = mappedRows.filter(r => {
            if (!r.Data_da_Visita) return false;
            try {
                // Normaliza para YYYY-MM-DD para comparação de string
                const d = new Date(r.Data_da_Visita);
                if (isNaN(d.getTime())) return false;
                const dStr = d.toISOString().split('T')[0];
                return dStr >= dateStart && dStr <= dateEnd;
            } catch(e) { return false; }
        });

        res.json(filteredRows);

    } catch (e) {
        console.error("Erro roteirizador:", e);
        res.status(500).json({ message: "Erro externo: " + e.message });
    }
});

// --- CONFIGURAÇÃO DE COMBUSTÍVEL ---
app.get('/config/fuel', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT * FROM ConfigReembolso WHERE ID = 1");
        res.json(rows[0] || {});
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/config/fuel', authenticateToken, async (req, res) => {
    try {
        const c = req.body;
        const query = `UPDATE ConfigReembolso SET PrecoCombustivel=@p, KmL_Carro=@kc, KmL_Moto=@km, UsuarioAlteracao='API', DataAlteracao=GETDATE(), MotivoAlteracao=@mtv WHERE ID = 1`;
        const params = [
            { name: 'p', type: TYPES.Decimal, value: c.PrecoCombustivel },
            { name: 'kc', type: TYPES.Decimal, value: c.KmL_Carro },
            { name: 'km', type: TYPES.Decimal, value: c.KmL_Moto },
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

// --- AUSÊNCIAS ---
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
        const query = `INSERT INTO ControleAusencias (ID_Colaborador, DataInicio, DataFim, Motivo, UsuarioRegistro) VALUES (@idc, @di, @df, @mtv, 'API'); SELECT SCOPE_IDENTITY() as id;`;
        const params = [
            { name: 'idc', type: TYPES.Int, value: a.ID_Colaborador },
            { name: 'di', type: TYPES.Date, value: a.DataInicio },
            { name: 'df', type: TYPES.Date, value: a.DataFim },
            { name: 'mtv', type: TYPES.NVarChar, value: a.Motivo }
        ];
        const { rows } = await executeQuery(dbConfig, query, params);
        res.json({ ...a, ID_Ausencia: rows[0].id });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/ausencias/:id', authenticateToken, async (req, res) => {
    try {
        await executeQuery(dbConfig, "DELETE FROM ControleAusencias WHERE ID_Ausencia = @id", [{ name: 'id', type: TYPES.Int, value: req.params.id }]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- USUÁRIOS ---
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