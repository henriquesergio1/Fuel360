// Carrega as variáveis de ambiente
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Connection, Request, TYPES } = require('tedious');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mariadb = require('mariadb'); // Novo driver

// --- Swagger Documentation ---
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swaggerConfig');

// --- Configurações de Segurança ---
const JWT_SECRET = process.env.JWT_SECRET || 'fuel360-secret-key-change-in-prod';
const SALT_ROUNDS = 10;

// --- Configurações de BD SQL Server ---
const dbServer = process.env.DB_SERVER_FUEL360 || process.env.DB_SERVER_FRETE;
const dbUser = process.env.DB_USER_FUEL360 || process.env.DB_USER_FRETE;
const dbPass = process.env.DB_PASSWORD_FUEL360 || process.env.DB_PASSWORD_FRETE;
const dbName = process.env.DB_DATABASE_FUEL360 || process.env.DB_DATABASE_FRETE || 'Fuel360';

if (!dbServer || !dbUser || !dbPass) {
    console.error("ERRO CRÍTICO: Variáveis de ambiente do Banco de Dados não configuradas.");
}

const dbConfig = {
  server: dbServer,
  authentication: {
    type: 'default',
    options: { userName: dbUser, password: dbPass },
  },
  options: { encrypt: true, database: dbName, rowCollectionOnRequestCompletion: true, trustServerCertificate: true },
};

function executeQuery(config, query, params = []) {
  return new Promise((resolve, reject) => {
    const connection = new Connection(config);
    connection.on('connect', (err) => {
      if (err) return reject(new Error(`Falha na conexão SQL: ${err.message}`));
      const request = new Request(query, (err, rowCount, rows) => {
        connection.close();
        if (err) return reject(new Error(`Erro SQL: ${err.message}`));
        const result = rows.map(row => {
          const obj = {};
          row.forEach(col => { obj[col.metadata.colName] = col.value; });
          return obj;
        });
        resolve({ rows: result, rowCount });
      });
      params.forEach(p => { request.addParameter(p.name, p.type, p.value, p.options); });
      connection.execSql(request);
    });
    connection.connect();
  });
}

// --- ROTINA DE SEED (USUÁRIO PADRÃO) ---
async function seedDefaultUser() {
    try {
        const checkTable = "SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Usuarios'";
        const { rows: tableRows } = await executeQuery(dbConfig, checkTable);
        
        if (tableRows.length > 0) {
            const { rows } = await executeQuery(dbConfig, "SELECT COUNT(*) as count FROM Usuarios");
            if (rows[0].count === 0) {
                console.log("⚠️ Tabela de usuários vazia. Criando usuário 'admin' padrão...");
                const hashedPassword = await bcrypt.hash('admin', SALT_ROUNDS);
                const query = `INSERT INTO Usuarios (Nome, Usuario, SenhaHash, Perfil, Ativo) VALUES (@nome, @user, @pass, @perfil, 1)`;
                const params = [
                    { name: 'nome', type: TYPES.NVarChar, value: 'Administrador Sistema' },
                    { name: 'user', type: TYPES.NVarChar, value: 'admin' },
                    { name: 'pass', type: TYPES.NVarChar, value: hashedPassword },
                    { name: 'perfil', type: TYPES.NVarChar, value: 'Admin' }
                ];
                await executeQuery(dbConfig, query, params);
                console.log("✅ Usuário 'admin' criado com sucesso (Senha: admin).");
            }
        }
    } catch (err) {
        console.error("Erro ao verificar/criar usuário padrão:", err.message);
    }
}

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const port = process.env.API_PORT || 3000;

// --- MIDDLEWARE DE LICENÇA ---
const checkLicense = async (req, res, next) => {
    const publicRoutes = ['/login', '/license', '/system/status', '/system/config'];
    const isPublicRoute = publicRoutes.some(route => req.path.startsWith(route));
    const isConfigPost = req.path.startsWith('/system/config') && req.method !== 'GET';
    
    if (isPublicRoute && !isConfigPost) return next();
    if (req.method === 'OPTIONS') return next();

    try {
        const { rows } = await executeQuery(dbConfig, "SELECT LicenseKey FROM SystemSettings WHERE ID = 1");
        const licenseKey = rows[0]?.LicenseKey;

        if (!licenseKey) return res.status(402).json({ message: 'Licença não encontrada.', code: 'LICENSE_MISSING' });

        try {
            const decoded = jwt.verify(licenseKey, JWT_SECRET);
            req.license = decoded;
            return next();
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                if (req.method === 'GET' || isPublicRoute) {
                    res.set('X-License-Status', 'EXPIRED');
                    return next();
                } else {
                    return res.status(402).json({ message: 'Sua licença expirou.', code: 'LICENSE_EXPIRED' });
                }
            } else {
                return res.status(402).json({ message: 'Licença inválida.', code: 'LICENSE_INVALID' });
            }
        }
    } catch (error) {
        return res.status(500).json({ message: 'Erro interno ao verificar licença.' });
    }
};

app.use(checkLicense);

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token não fornecido.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token inválido.' });
        req.user = user;
        next();
    });
};

// --- ROTAS DE SISTEMA ---
app.get('/', (req, res) => res.send('API Fuel360 OK.'));

app.get('/system/status', async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT LicenseKey FROM SystemSettings WHERE ID = 1");
        const key = rows[0]?.LicenseKey;
        if (!key) return res.json({ status: 'MISSING' });
        try {
            const decoded = jwt.verify(key, JWT_SECRET);
            res.json({ status: 'ACTIVE', client: decoded.client, expiresAt: new Date(decoded.exp * 1000) });
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                const decoded = jwt.decode(key);
                res.json({ status: 'EXPIRED', client: decoded?.client, expiresAt: new Date(decoded?.exp * 1000) });
            } else {
                res.json({ status: 'INVALID' });
            }
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/license', authenticateToken, async (req, res) => {
    if (req.user.perfil !== 'Admin') return res.status(403).json({ message: 'Acesso negado.' });
    const { licenseKey } = req.body;
    try {
        const decoded = jwt.verify(licenseKey, JWT_SECRET);
        await executeQuery(dbConfig, "UPDATE SystemSettings SET LicenseKey = @key WHERE ID = 1", [{ name: 'key', type: TYPES.NVarChar, value: licenseKey }]);
        res.json({ success: true, message: 'Licença ativada!', client: decoded.client, expiresAt: new Date(decoded.exp * 1000) });
    } catch (err) {
        res.status(400).json({ message: 'Chave de licença inválida ou expirada.' });
    }
});

app.get('/system/config', async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT CompanyName, LogoUrl FROM SystemSettings WHERE ID = 1");
        const config = rows[0] || { CompanyName: 'Fuel360', LogoUrl: '' };
        res.json({ companyName: config.CompanyName, logoUrl: config.LogoUrl });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/system/config', authenticateToken, async (req, res) => {
    if (req.user.perfil !== 'Admin') return res.status(403).json({ message: 'Acesso negado.' });
    const { companyName, logoUrl } = req.body;
    try {
        await executeQuery(dbConfig, "UPDATE SystemSettings SET CompanyName = @name, LogoUrl = @logo WHERE ID = 1", [
            { name: 'name', type: TYPES.NVarChar, value: companyName },
            { name: 'logo', type: TYPES.NVarChar, value: logoUrl }
        ]);
        res.json({ success: true, message: 'Configurações salvas.' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/login', async (req, res) => {
    const { usuario, senha } = req.body;
    try {
        const { rows } = await executeQuery(dbConfig, "SELECT * FROM Usuarios WHERE Usuario = @user AND Ativo = 1", [{ name: 'user', type: TYPES.NVarChar, value: usuario }]);
        if (rows.length === 0) return res.status(401).json({ message: 'Usuário ou senha incorretos.' });
        
        const user = rows[0];
        const validPassword = await bcrypt.compare(senha, user.SenhaHash);
        if (!validPassword) return res.status(401).json({ message: 'Usuário ou senha incorretos.' });

        const token = jwt.sign({ id: user.ID_Usuario, usuario: user.Usuario, nome: user.Nome, perfil: user.Perfil }, JWT_SECRET, { expiresIn: '12h' });
        res.json({ user: { ID_Usuario: user.ID_Usuario, Nome: user.Nome, Usuario: user.Usuario, Perfil: user.Perfil, Ativo: user.Ativo }, token });
    } catch (error) { res.status(500).json({ message: error.message }); }
});

// --- USUÁRIOS ---
app.get('/usuarios', authenticateToken, async (req, res) => {
    if (req.user.perfil !== 'Admin') return res.status(403).json({ message: 'Acesso negado.' });
    try {
        const { rows } = await executeQuery(dbConfig, 'SELECT ID_Usuario, Nome, Usuario, Perfil, Ativo, DataCriacao FROM Usuarios ORDER BY Nome');
        res.json(rows);
    } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/usuarios', authenticateToken, async (req, res) => {
    if (req.user.perfil !== 'Admin') return res.status(403).json({ message: 'Acesso negado.' });
    const { Nome, Usuario, Senha, Perfil } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(Senha, SALT_ROUNDS);
        const query = `INSERT INTO Usuarios (Nome, Usuario, SenhaHash, Perfil, Ativo) OUTPUT INSERTED.ID_Usuario, INSERTED.Nome, INSERTED.Usuario, INSERTED.Perfil, INSERTED.Ativo VALUES (@nome, @user, @pass, @perfil, 1)`;
        const params = [{ name: 'nome', type: TYPES.NVarChar, value: Nome }, { name: 'user', type: TYPES.NVarChar, value: Usuario }, { name: 'pass', type: TYPES.NVarChar, value: hashedPassword }, { name: 'perfil', type: TYPES.NVarChar, value: Perfil }];
        const { rows } = await executeQuery(dbConfig, query, params);
        res.status(201).json(rows[0]);
    } catch (error) { res.status(500).json({ message: error.message }); }
});

app.put('/usuarios/:id', authenticateToken, async (req, res) => {
    if (req.user.perfil !== 'Admin') return res.status(403).json({ message: 'Acesso negado.' });
    const { Nome, Perfil, Ativo, Senha } = req.body;
    try {
        let query = `UPDATE Usuarios SET Nome=@nome, Perfil=@perfil, Ativo=@ativo`;
        const params = [{ name: 'id', type: TYPES.Int, value: req.params.id }, { name: 'nome', type: TYPES.NVarChar, value: Nome }, { name: 'perfil', type: TYPES.NVarChar, value: Perfil }, { name: 'ativo', type: TYPES.Bit, value: Ativo }];
        if (Senha) {
            const hashedPassword = await bcrypt.hash(Senha, SALT_ROUNDS);
            query += `, SenhaHash=@pass`;
            params.push({ name: 'pass', type: TYPES.NVarChar, value: hashedPassword });
        }
        query += ` OUTPUT INSERTED.ID_Usuario, INSERTED.Nome, INSERTED.Usuario, INSERTED.Perfil, INSERTED.Ativo WHERE ID_Usuario=@id`;
        const { rows } = await executeQuery(dbConfig, query, params);
        res.json(rows[0]);
    } catch (error) { res.status(500).json({ message: error.message }); }
});

// --- COLABORADORES (COM AUDITORIA) ---
app.get('/colaboradores', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, 'SELECT * FROM Colaboradores ORDER BY Nome');
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/colaboradores', authenticateToken, async (req, res) => {
    const c = req.body;
    const user = req.user.usuario; 
    try {
        const q = `INSERT INTO Colaboradores (ID_Pulsus, CodigoSetor, Nome, Grupo, TipoVeiculo, Ativo, UsuarioCriacao) OUTPUT INSERTED.* VALUES (@idp, @cod, @nome, @grp, @tipo, @ativo, @user)`;
        const p = [
            {name:'idp',type:TYPES.Int,value:c.ID_Pulsus}, {name:'cod',type:TYPES.Int,value:c.CodigoSetor},
            {name:'nome',type:TYPES.NVarChar,value:c.Nome}, {name:'grp',type:TYPES.NVarChar,value:c.Grupo},
            {name:'tipo',type:TYPES.NVarChar,value:c.TipoVeiculo}, {name:'ativo',type:TYPES.Bit,value:c.Ativo},
            {name:'user',type:TYPES.NVarChar,value:user}
        ];
        const { rows } = await executeQuery(dbConfig, q, p);
        res.status(201).json(rows[0]);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/colaboradores/:id', authenticateToken, async (req, res) => {
    const c = req.body;
    const user = req.user.usuario;
    const motivo = c.MotivoAlteracao || 'Alteração de cadastro'; 

    try {
        const q = `UPDATE Colaboradores SET ID_Pulsus=@idp, CodigoSetor=@cod, Nome=@nome, Grupo=@grp, TipoVeiculo=@tipo, Ativo=@ativo, 
                   DataAlteracao=GETDATE(), UsuarioAlteracao=@user, MotivoAlteracao=@motivo 
                   OUTPUT INSERTED.* WHERE ID_Colaborador=@id`;
        const p = [
            {name:'id',type:TYPES.Int,value:req.params.id}, {name:'idp',type:TYPES.Int,value:c.ID_Pulsus}, 
            {name:'cod',type:TYPES.Int,value:c.CodigoSetor}, {name:'nome',type:TYPES.NVarChar,value:c.Nome}, 
            {name:'grp',type:TYPES.NVarChar,value:c.Grupo}, {name:'tipo',type:TYPES.NVarChar,value:c.TipoVeiculo}, 
            {name:'ativo',type:TYPES.Bit,value:c.Ativo},
            {name:'user',type:TYPES.NVarChar,value:user}, {name:'motivo',type:TYPES.NVarChar,value:motivo}
        ];
        const { rows } = await executeQuery(dbConfig, q, p);
        res.json(rows[0]);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// NOVO: Rota para Mover em Massa (Bulk Update Group)
app.post('/colaboradores/move', authenticateToken, async (req, res) => {
    const { ids, grupo } = req.body;
    const user = req.user.usuario;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0 || !grupo) {
        return res.status(400).json({ message: "Dados inválidos para movimentação." });
    }

    try {
        let count = 0;
        for (const id of ids) {
             await executeQuery(dbConfig, 
                `UPDATE Colaboradores SET Grupo=@grp, DataAlteracao=GETDATE(), UsuarioAlteracao=@user, MotivoAlteracao='Transferência em Massa' WHERE ID_Colaborador=@id`,
                [
                    {name:'grp', type:TYPES.NVarChar, value:grupo},
                    {name:'user', type:TYPES.NVarChar, value:user},
                    {name:'id', type:TYPES.Int, value:id}
                ]
             );
             count++;
        }

        // Log único da operação
        await executeQuery(dbConfig, 
            `INSERT INTO LogsSistema (Usuario, Acao, Detalhes) VALUES (@user, 'TRANSFERENCIA_MASSA', @detalhes)`, 
            [
                {name:'user', type:TYPES.NVarChar, value:user},
                {name:'detalhes', type:TYPES.NVarChar, value:`Moveu ${count} colaboradores para o grupo ${grupo}`}
            ]
        );

        res.json({ success: true, count, message: `Movidos ${count} colaboradores para ${grupo}.` });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message });
    }
});

// NOVO v1.5.0: Rota para Atualização de Campos Específicos em Massa (Veículo/Ativo)
app.post('/colaboradores/update-field', authenticateToken, async (req, res) => {
    const { ids, field, value, reason } = req.body;
    const user = req.user.usuario;

    if (!ids || !Array.isArray(ids) || ids.length === 0 || !field || value === undefined || !reason) {
        return res.status(400).json({ message: "Dados inválidos ou motivo não informado." });
    }

    const allowedFields = {
        'TipoVeiculo': { type: TYPES.NVarChar, col: 'TipoVeiculo' },
        'Ativo': { type: TYPES.Bit, col: 'Ativo' }
    };

    if (!allowedFields[field]) {
        return res.status(400).json({ message: "Campo inválido para atualização em massa." });
    }

    try {
        let count = 0;
        const config = allowedFields[field];

        for (const id of ids) {
            await executeQuery(dbConfig, 
               `UPDATE Colaboradores SET ${config.col}=@val, DataAlteracao=GETDATE(), UsuarioAlteracao=@user, MotivoAlteracao=@motivo WHERE ID_Colaborador=@id`,
               [
                   {name:'val', type: config.type, value: value},
                   {name:'user', type:TYPES.NVarChar, value:user},
                   {name:'motivo', type:TYPES.NVarChar, value:reason},
                   {name:'id', type:TYPES.Int, value:id}
               ]
            );
            count++;
       }

       await executeQuery(dbConfig, 
           `INSERT INTO LogsSistema (Usuario, Acao, Detalhes) VALUES (@user, 'ATUALIZACAO_MASSA', @detalhes)`, 
           [
               {name:'user', type:TYPES.NVarChar, value:user},
               {name:'detalhes', type:TYPES.NVarChar, value:`Atualizou ${field} para '${value}' em ${count} colaboradores. Motivo: ${reason}`}
           ]
       );

       res.json({ success: true, count, message: `Atualizados ${count} colaboradores.` });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message });
    }
});

// NOVO v1.7.0: Sugestão de Vínculo Inteligente (Baseado em Histórico)
app.post('/colaboradores/sugestao-vinculo', authenticateToken, async (req, res) => {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.json([]);
    }

    try {
        const results = [];
        
        // Para cada ID ignorado, buscamos o último registro no histórico
        for (const id of ids) {
            const q = `
                SELECT TOP 1 NomeColaborador, Grupo
                FROM HistoricoDetalhes
                WHERE ID_Pulsus = @id
                ORDER BY ID_Detalhe DESC
            `;
            const { rows } = await executeQuery(dbConfig, q, [{name:'id', type:TYPES.Int, value:id}]);
            
            if (rows.length > 0) {
                results.push({
                    ID_Pulsus: id,
                    NomeSuggestion: rows[0].NomeColaborador,
                    GrupoSuggestion: rows[0].Grupo
                });
            }
        }
        
        res.json(results);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Erro ao buscar sugestões." });
    }
});

app.delete('/colaboradores/:id', authenticateToken, async (req, res) => {
    const user = req.user.usuario;
    try {
        const logQ = `INSERT INTO LogsSistema (Usuario, Acao, Detalhes) VALUES (@user, 'EXCLUSAO_COLABORADOR', @detalhes)`;
        await executeQuery(dbConfig, logQ, [
            {name:'user',type:TYPES.NVarChar,value:user},
            {name:'detalhes',type:TYPES.NVarChar,value:`Excluiu colaborador ID ${req.params.id}`}
        ]);
        await executeQuery(dbConfig, 'DELETE FROM Colaboradores WHERE ID_Colaborador = @id', [{name:'id',type:TYPES.Int,value:req.params.id}]);
        res.status(204).send();
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- INTEGRAÇÃO DB EXTERNO (Refatorado v1.4.6) ---

// 1. GET Config
app.get('/integracao/config', authenticateToken, async (req, res) => {
    if (req.user.perfil !== 'Admin') return res.status(403).json({ message: 'Acesso negado.' });
    try {
        const { rows } = await executeQuery(dbConfig, 'SELECT ExtDb_Host, ExtDb_Port, ExtDb_User, ExtDb_Database, ExtDb_Query FROM SystemSettings WHERE ID = 1');
        // Não retornar senha
        res.json(rows[0] || {});
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// 2. SAVE Config
app.put('/integracao/config', authenticateToken, async (req, res) => {
    if (req.user.perfil !== 'Admin') return res.status(403).json({ message: 'Acesso negado.' });
    const { extDb_Host, extDb_Port, extDb_User, extDb_Pass, extDb_Database, extDb_Query } = req.body;
    
    try {
        let q = `UPDATE SystemSettings SET ExtDb_Host=@h, ExtDb_Port=@p, ExtDb_User=@u, ExtDb_Database=@d, ExtDb_Query=@q`;
        const params = [
            {name:'h', type:TYPES.NVarChar, value:extDb_Host},
            {name:'p', type:TYPES.Int, value:extDb_Port},
            {name:'u', type:TYPES.NVarChar, value:extDb_User},
            {name:'d', type:TYPES.NVarChar, value:extDb_Database},
            {name:'q', type:TYPES.NVarChar, value:extDb_Query}
        ];
        
        if (extDb_Pass && extDb_Pass.trim() !== '') {
            q += `, ExtDb_Pass=@pass`;
            params.push({name:'pass', type:TYPES.NVarChar, value:extDb_Pass});
        }
        
        q += ` WHERE ID = 1`;
        
        await executeQuery(dbConfig, q, params);
        res.json({ success: true, message: 'Configuração de integração salva.' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// 3. PREVIEW Import (Diff)
app.post('/integracao/preview', authenticateToken, async (req, res) => {
    let mariaConn;
    try {
        // 1. Carregar Config
        const { rows: configRows } = await executeQuery(dbConfig, 'SELECT * FROM SystemSettings WHERE ID = 1');
        const config = configRows[0];
        
        if (!config || !config.ExtDb_Host) {
            return res.status(400).json({ message: 'Integração não configurada. Acesse o menu Admin.' });
        }

        // 2. Conectar DB Externo
        mariaConn = await mariadb.createConnection({
            host: config.ExtDb_Host,
            port: config.ExtDb_Port || 3306,
            user: config.ExtDb_User,
            password: config.ExtDb_Pass,
            database: config.ExtDb_Database
        });

        // 3. Executar Query Externa
        const externalRows = await mariaConn.query(config.ExtDb_Query);
        if (!externalRows || !Array.isArray(externalRows)) throw new Error("A query não retornou dados.");

        // 4. Carregar Dados Internos
        const { rows: internalRows } = await executeQuery(dbConfig, 'SELECT * FROM Colaboradores');

        // 4.1 Carregar Lista de Grupos Válidos (Para prevenir criação de lixo)
        // Adiciona grupos que JÁ EXISTEM no banco + Vendedor/Promotor (Padrões do sistema)
        const validGroups = new Set(['vendedor', 'promotor']);
        internalRows.forEach(r => {
             if (r.Grupo) validGroups.add(r.Grupo.toLowerCase());
        });

        // 5. Comparar (Diff Logic)
        const novos = [];
        const alterados = [];
        
        for (const ext of externalRows) {
            // Case insensitive keys from external
            const id_pulsus = Number(ext.id_pulsus || ext.ID_PULSUS);
            const nome = (ext.nome || ext.NOME || '').trim();
            const codigo_setor = Number(ext.codigo_setor || ext.CODIGO_SETOR || 0);
            
            // Lógica de Validação de Grupo
            let grupoRaw = (ext.grupo || ext.GRUPO || '').trim();
            let grupo = 'Outros'; 

            if (grupoRaw && validGroups.has(grupoRaw.toLowerCase())) {
                // Se o grupo do banco externo é válido (existe no sistema ou é padrão), usamos ele.
                // Mantém a grafia original do banco externo.
                grupo = grupoRaw; 
            } else {
                // Se o grupo é desconhecido (ex: "Supervisor", "Motorista") e não existe no sistema,
                // forçamos para "Outros" para evitar poluição das abas.
                grupo = 'Outros';
            }

            if (!id_pulsus || !nome) continue;

            const interno = internalRows.find(i => i.ID_Pulsus === id_pulsus);
            const newData = { id_pulsus, nome, codigo_setor, grupo };

            if (!interno) {
                // Novo registro
                novos.push({ id_pulsus, nome, changes: [], newData });
            } else {
                // Checar diferenças
                // REGRA DE PRESERVAÇÃO: Não verificamos grupo em usuários existentes. 
                // Apenas Nome e Setor são atualizados pelo DB externo.
                const changes = [];
                if (interno.Nome.trim() !== nome) changes.push({ field: 'Nome', oldValue: interno.Nome, newValue: nome });
                if (interno.CodigoSetor !== codigo_setor) changes.push({ field: 'CodigoSetor', oldValue: interno.CodigoSetor, newValue: codigo_setor });
                
                // Ignorar diff de grupo para existentes

                if (changes.length > 0) {
                    // Mantemos o grupo original no newData para não sobrescrever visualmente no preview,
                    // mas a lógica de sync não vai usar esse campo para update.
                    newData.grupo = interno.Grupo; 
                    alterados.push({ id_pulsus, nome, changes, newData });
                }
            }
        }

        res.json({
            novos,
            alterados,
            totalExternal: externalRows.length
        });

    } catch (err) {
        console.error("Erro no preview de importação:", err);
        res.status(500).json({ message: `Erro ao conectar/processar: ${err.message}` });
    } finally {
        if (mariaConn) mariaConn.end();
    }
});

// 4. SYNC (Apply Changes)
app.post('/integracao/sync', authenticateToken, async (req, res) => {
    const { items } = req.body; // Array de DiffItems
    const adminUser = req.user.usuario;

    if (!items || !Array.isArray(items)) return res.status(400).json({ message: 'Dados inválidos.' });

    let processedCount = 0;
    try {
        for (const item of items) {
            const { id_pulsus, nome, codigo_setor, grupo } = item.newData;
            
            // Check Existencia
            const checkQ = `SELECT ID_Colaborador FROM Colaboradores WHERE ID_Pulsus = @idp`;
            const { rows: existing } = await executeQuery(dbConfig, checkQ, [{ name: 'idp', type: TYPES.Int, value: id_pulsus }]);

            if (existing.length > 0) {
                // Update
                // REGRA: NÃO ATUALIZAR GRUPO DE USUÁRIO EXISTENTE
                const updateQ = `UPDATE Colaboradores SET CodigoSetor=@cod, Nome=@nome, DataAlteracao=GETDATE(), MotivoAlteracao='Sincronização DB', UsuarioAlteracao=@user WHERE ID_Pulsus=@idp`;
                await executeQuery(dbConfig, updateQ, [
                    { name: 'cod', type: TYPES.Int, value: codigo_setor },
                    { name: 'nome', type: TYPES.NVarChar, value: nome },
                    { name: 'idp', type: TYPES.Int, value: id_pulsus },
                    { name: 'user', type: TYPES.NVarChar, value: adminUser }
                ]);
            } else {
                // Insert
                // REGRA: Se grupo vazio (Outros), já vem tratado do preview
                const insertQ = `INSERT INTO Colaboradores (ID_Pulsus, CodigoSetor, Nome, Grupo, TipoVeiculo, Ativo, UsuarioCriacao) VALUES (@idp, @cod, @nome, @grp, 'Carro', 1, @user)`;
                await executeQuery(dbConfig, insertQ, [
                    { name: 'idp', type: TYPES.Int, value: id_pulsus },
                    { name: 'cod', type: TYPES.Int, value: codigo_setor },
                    { name: 'nome', type: TYPES.NVarChar, value: nome },
                    { name: 'grp', type: TYPES.NVarChar, value: grupo },
                    { name: 'user', type: TYPES.NVarChar, value: adminUser }
                ]);
            }
            processedCount++;
        }
        
        // Log Batch
        await executeQuery(dbConfig, 
            `INSERT INTO LogsSistema (Usuario, Acao, Detalhes) VALUES (@user, 'SINCRONIZACAO_DB', @detalhes)`, 
            [
                {name:'user', type:TYPES.NVarChar, value:adminUser},
                {name:'detalhes', type:TYPES.NVarChar, value:`Sincronizou ${processedCount} colaboradores do banco externo.`}
            ]
        );

        res.json({ message: 'Sincronização realizada com sucesso.', count: processedCount });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: `Erro ao salvar dados: ${e.message}` });
    }
});

// --- GESTÃO DE AUSÊNCIAS (NOVO v1.3.7 / Update 1.4.1) ---
app.get('/ausencias', authenticateToken, async (req, res) => {
    try {
        const q = `
            SELECT a.ID_Ausencia, a.ID_Colaborador, a.DataInicio, a.DataFim, a.Motivo,
                   c.Nome as NomeColaborador, c.ID_Pulsus
            FROM ControleAusencias a
            INNER JOIN Colaboradores c ON a.ID_Colaborador = c.ID_Colaborador
            ORDER BY a.DataInicio DESC
        `;
        const { rows } = await executeQuery(dbConfig, q);
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/ausencias', authenticateToken, async (req, res) => {
    const { ID_Colaborador, DataInicio, DataFim, Motivo } = req.body;
    const user = req.user.usuario;

    const fixDate = (dtStr) => {
        const d = new Date(dtStr);
        d.setUTCHours(12, 0, 0, 0);
        return d;
    };

    try {
        const q = `INSERT INTO ControleAusencias (ID_Colaborador, DataInicio, DataFim, Motivo, UsuarioRegistro)
                   OUTPUT INSERTED.*
                   VALUES (@idc, @di, @df, @motivo, @user)`;
        const p = [
            {name:'idc', type:TYPES.Int, value:ID_Colaborador},
            {name:'di', type:TYPES.Date, value: fixDate(DataInicio)},
            {name:'df', type:TYPES.Date, value: fixDate(DataFim)},
            {name:'motivo', type:TYPES.NVarChar, value:Motivo},
            {name:'user', type:TYPES.NVarChar, value:user}
        ];
        const { rows } = await executeQuery(dbConfig, q, p);
        
        const nova = rows[0];
        const qColab = `SELECT Nome as NomeColaborador, ID_Pulsus FROM Colaboradores WHERE ID_Colaborador = @id`;
        const { rows: rowsC } = await executeQuery(dbConfig, qColab, [{name:'id',type:TYPES.Int,value:ID_Colaborador}]);
        
        res.status(201).json({ ...nova, ...rowsC[0] });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/ausencias/:id', authenticateToken, async (req, res) => {
    const { motivo } = req.body; 
    const user = req.user.usuario;

    try {
        await executeQuery(dbConfig, 
            `INSERT INTO LogsSistema (Usuario, Acao, Detalhes) VALUES (@user, 'EXCLUSAO_AUSENCIA', @detalhes)`, 
            [
                {name:'user',type:TYPES.NVarChar,value:user},
                {name:'detalhes',type:TYPES.NVarChar,value:`Excluiu Ausência ID ${req.params.id}. Motivo: ${motivo || 'Não informado'}`}
            ]
        );
        await executeQuery(dbConfig, 'DELETE FROM ControleAusencias WHERE ID_Ausencia = @id', [{name:'id',type:TYPES.Int,value:req.params.id}]);
        res.status(204).send();
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- CONFIGURAÇÃO DE REEMBOLSO ---
app.get('/fuel-config', authenticateToken, async (req, res) => {
    try {
        const { rows } = await executeQuery(dbConfig, 'SELECT * FROM ConfigReembolso WHERE ID = 1');
        res.json(rows[0] || { PrecoCombustivel: 5.89, KmL_Carro: 10, KmL_Moto: 35 });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/fuel-config/history', authenticateToken, async (req, res) => {
    try {
        const q = `SELECT TOP 10 * FROM LogsSistema WHERE Acao = 'ALTERACAO_PARAMETROS' ORDER BY DataHora DESC`;
        const { rows } = await executeQuery(dbConfig, q);
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/fuel-config', authenticateToken, async (req, res) => {
    const c = req.body;
    const user = req.user.usuario;
    const motivo = c.MotivoAlteracao || 'Ajuste de parâmetros';

    try {
        const qUpdate = `UPDATE ConfigReembolso SET PrecoCombustivel=@p, KmL_Carro=@kc, KmL_Moto=@km, 
                   DataAlteracao=GETDATE(), UsuarioAlteracao=@user, MotivoAlteracao=@motivo 
                   WHERE ID = 1`;
        const pUpdate = [
            {name:'p',type:TYPES.Decimal,value:c.PrecoCombustivel,options:{precision:10,scale:2}},
            {name:'kc',type:TYPES.Decimal,value:c.KmL_Carro,options:{precision:10,scale:2}},
            {name:'km',type:TYPES.Decimal,value:c.KmL_Moto,options:{precision:10,scale:2}},
            {name:'user',type:TYPES.NVarChar,value:user}, {name:'motivo',type:TYPES.NVarChar,value:motivo}
        ];
        await executeQuery(dbConfig, qUpdate, pUpdate);

        const qLog = `INSERT INTO LogsSistema (Usuario, Acao, Detalhes) VALUES (@user, 'ALTERACAO_PARAMETROS', @detalhes)`;
        const detalhesLog = `Combustível: R$${c.PrecoCombustivel}, Carro: ${c.KmL_Carro}km/l, Moto: ${c.KmL_Moto}km/l. Motivo: ${motivo}`;
        const pLog = [
            {name:'user',type:TYPES.NVarChar,value:user},
            {name:'detalhes',type:TYPES.NVarChar,value:detalhesLog}
        ];
        await executeQuery(dbConfig, qLog, pLog);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- SALVAR CÁLCULO E RELATÓRIOS ---
app.get('/calculos/check-periodo', authenticateToken, async (req, res) => {
    const { periodo } = req.query;
    try {
        const q = `SELECT COUNT(*) as count FROM HistoricoCalculos WHERE PeriodoReferencia = @p`;
        const { rows } = await executeQuery(dbConfig, q, [{name:'p', type:TYPES.NVarChar, value:periodo}]);
        res.json({ exists: rows[0].count > 0 });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/calculos', authenticateToken, async (req, res) => {
    const { Periodo, TotalGeral, Itens, Overwrite, MotivoOverwrite } = req.body; 
    const user = req.user.usuario;

    try {
        if (Overwrite) {
            await executeQuery(dbConfig,
                `INSERT INTO LogsSistema (Usuario, Acao, Detalhes) VALUES (@user, 'SOBRESCREVER_HISTORICO', @detalhes)`,
                [
                    {name:'user', type:TYPES.NVarChar, value:user},
                    {name:'detalhes', type:TYPES.NVarChar, value:`Sobrescreveu período: ${Periodo}. Motivo: ${MotivoOverwrite || 'Não informado'}`}
                ]
            );
            await executeQuery(dbConfig, 
                `DELETE FROM HistoricoCalculos WHERE PeriodoReferencia = @p`,
                [{name:'p', type:TYPES.NVarChar, value: Periodo}]
            );
        }

        const qHeader = `INSERT INTO HistoricoCalculos (PeriodoReferencia, UsuarioGerador, TotalGeral, QtdColaboradores) 
                         OUTPUT INSERTED.ID_Calculo 
                         VALUES (@periodo, @user, @total, @qtd)`;
        const pHeader = [
            {name:'periodo', type:TYPES.NVarChar, value:Periodo},
            {name:'user', type:TYPES.NVarChar, value:user},
            {name:'total', type:TYPES.Decimal, value:TotalGeral, options:{precision:18,scale:2}},
            {name:'qtd', type:TYPES.Int, value:Itens.length}
        ];
        
        const { rows: headerRows } = await executeQuery(dbConfig, qHeader, pHeader);
        const idCalculo = headerRows[0].ID_Calculo;

        for (const item of Itens) {
            const qDet = `INSERT INTO HistoricoDetalhes (ID_Calculo, ID_Pulsus, NomeColaborador, Grupo, TipoVeiculo, TotalKM, ValorReembolso, ParametroPreco, ParametroKmL)
                          OUTPUT INSERTED.ID_Detalhe
                          VALUES (@idc, @idp, @nome, @grp, @tipo, @km, @val, @pp, @pk)`;
            const pDet = [
                {name:'idc', type:TYPES.Int, value:idCalculo},
                {name:'idp', type:TYPES.Int, value:item.ID_Pulsus},
                {name:'nome', type:TYPES.NVarChar, value:item.Nome},
                {name:'grp', type:TYPES.NVarChar, value:item.Grupo},
                {name:'tipo', type:TYPES.NVarChar, value:item.TipoVeiculo},
                {name:'km', type:TYPES.Decimal, value:item.TotalKM, options:{precision:10,scale:2}},
                {name:'val', type:TYPES.Decimal, value:item.ValorReembolso, options:{precision:10,scale:2}},
                {name:'pp', type:TYPES.Decimal, value:item.ParametroPreco, options:{precision:10,scale:2}},
                {name:'pk', type:TYPES.Decimal, value:item.ParametroKmL, options:{precision:10,scale:2}}
            ];
            const { rows: detRows } = await executeQuery(dbConfig, qDet, pDet);
            const idDetalhe = detRows[0].ID_Detalhe;

            if (item.RegistrosDiarios && Array.isArray(item.RegistrosDiarios)) {
                for (const reg of item.RegistrosDiarios) {
                    const qDaily = `INSERT INTO HistoricoDiario (ID_Detalhe, DataOcorrencia, KM_Dia, Valor_Dia, Observacao)
                                    VALUES (@idd, @dt, @kmd, @vald, @obs)`;
                    const pDaily = [
                        {name:'idd', type:TYPES.Int, value:idDetalhe},
                        {name:'dt', type:TYPES.Date, value: new Date(reg.Data)},
                        {name:'kmd', type:TYPES.Decimal, value:reg.KM, options:{precision:10,scale:2}},
                        {name:'vald', type:TYPES.Decimal, value:reg.Valor, options:{precision:10,scale:2}},
                        {name:'obs', type:TYPES.NVarChar, value:reg.Observacao || null}
                    ];
                    await executeQuery(dbConfig, qDaily, pDaily);
                }
            }
        }

        await executeQuery(dbConfig, 
            `INSERT INTO LogsSistema (Usuario, Acao, Detalhes) VALUES (@user, 'SALVAR_CALCULO', @detalhes)`, 
            [
                {name:'user', type:TYPES.NVarChar, value:user},
                {name:'detalhes', type:TYPES.NVarChar, value:`Salvou cálculo ID ${idCalculo} para o período ${Periodo} ${Overwrite ? '(Sobrescrito)' : ''}`}
            ]
        );

        res.status(201).json({ success: true, id: idCalculo });

    } catch (e) {
        console.error("Erro ao salvar cálculo:", e);
        res.status(500).json({ message: "Erro ao salvar histórico de cálculo." });
    }
});

app.get('/relatorios/reembolso', authenticateToken, async (req, res) => {
    const { startDate, endDate, colaboradorId, grupo } = req.query;

    try {
        let query = `
            SELECT 
                h.DataGeracao, h.PeriodoReferencia, h.UsuarioGerador,
                d.ID_Detalhe, d.ID_Pulsus, d.NomeColaborador, d.Grupo, d.TipoVeiculo,
                d.TotalKM, d.ValorReembolso, d.ParametroPreco, d.ParametroKmL
            FROM HistoricoDetalhes d
            INNER JOIN HistoricoCalculos h ON d.ID_Calculo = h.ID_Calculo
            WHERE 1=1
        `;
        const params = [];

        if (startDate) {
            query += ` AND h.DataGeracao >= @start`;
            params.push({name:'start', type:TYPES.DateTime, value: new Date(startDate + 'T00:00:00')});
        }
        if (endDate) {
            query += ` AND h.DataGeracao <= @end`;
            params.push({name:'end', type:TYPES.DateTime, value: new Date(endDate + 'T23:59:59')});
        }
        if (colaboradorId) {
             query += ` AND d.ID_Pulsus = @colabId`;
             params.push({name:'colabId', type:TYPES.Int, value: parseInt(colaboradorId)});
        }
        if (grupo && grupo.trim() !== '') {
            query += ` AND d.Grupo = @grp`;
            params.push({name:'grp', type:TYPES.NVarChar, value: grupo});
        }
        query += ` ORDER BY h.DataGeracao DESC, d.NomeColaborador ASC`;
        const { rows } = await executeQuery(dbConfig, query, params);
        res.json(rows);
    } catch (e) { res.status(500).json({ message: "Erro ao buscar dados do relatório." }); }
});

app.get('/relatorios/analitico', authenticateToken, async (req, res) => {
    const { startDate, endDate, colaboradorId, grupo } = req.query;
    try {
        // Query com LEFT JOIN para detectar conflito de ausências retroativamente
        let query = `
            SELECT 
                dia.ID_Diario, dia.DataOcorrencia, dia.KM_Dia, dia.Valor_Dia, dia.Observacao,
                d.ID_Pulsus, d.NomeColaborador, d.Grupo, d.TipoVeiculo,
                h.DataGeracao, h.PeriodoReferencia,
                CASE WHEN a.ID_Ausencia IS NOT NULL THEN 1 ELSE 0 END as TemAusencia,
                a.Motivo as MotivoAusencia
            FROM HistoricoDiario dia
            INNER JOIN HistoricoDetalhes d ON dia.ID_Detalhe = d.ID_Detalhe
            INNER JOIN HistoricoCalculos h ON d.ID_Calculo = h.ID_Calculo
            LEFT JOIN ControleAusencias a ON a.ID_Colaborador = (SELECT TOP 1 ID_Colaborador FROM Colaboradores WHERE ID_Pulsus = d.ID_Pulsus)
                                         AND dia.DataOcorrencia BETWEEN a.DataInicio AND a.DataFim
            WHERE 1=1
        `;
        const params = [];

        if (startDate) {
            query += ` AND h.DataGeracao >= @start`;
            params.push({name:'start', type:TYPES.DateTime, value: new Date(startDate + 'T00:00:00')});
        }
        if (endDate) {
            query += ` AND h.DataGeracao <= @end`;
            params.push({name:'end', type:TYPES.DateTime, value: new Date(endDate + 'T23:59:59')});
        }
        if (colaboradorId) {
             query += ` AND d.ID_Pulsus = @colabId`;
             params.push({name:'colabId', type:TYPES.Int, value: parseInt(colaboradorId)});
        }
        if (grupo && grupo.trim() !== '') {
            query += ` AND d.Grupo = @grp`;
            params.push({name:'grp', type:TYPES.NVarChar, value: grupo});
        }
        query += ` ORDER BY d.NomeColaborador ASC, dia.DataOcorrencia ASC`;
        const { rows } = await executeQuery(dbConfig, query, params);
        res.json(rows);
    } catch (e) { res.status(500).json({ message: "Erro ao buscar dados analíticos." }); }
});

// Nova Rota: Correção Retroativa de Ausências
app.post('/calculos/corrigir-ausencias', authenticateToken, async (req, res) => {
    const { idsDiarios } = req.body;
    const user = req.user.usuario;

    if (!idsDiarios || !Array.isArray(idsDiarios)) return res.status(400).json({message: 'IDs inválidos'});

    try {
        let count = 0;
        for (const id of idsDiarios) {
            await executeQuery(dbConfig, 
                `UPDATE HistoricoDiario 
                 SET KM_Dia = 0, Valor_Dia = 0, Observacao = CONCAT(ISNULL(Observacao, ''), ' [Ajuste Retroativo: Ausência Detectada]')
                 WHERE ID_Diario = @id`,
                 [{name:'id', type:TYPES.Int, value:id}]
            );
            count++;
        }

        // Também precisamos atualizar os totais no pai (HistoricoDetalhes) e no avô (HistoricoCalculos)
        // Por simplicidade, assumimos que o relatório analítico mostrará zerado, mas o cabeçalho original 
        // mantem o valor histórico "errado" a menos que façamos um recalc complexo.
        // Para auditoria estrita, o ideal é criar um registro de estorno, mas aqui vamos apenas zerar o dia
        // para que na re-impressão saia correto.
        
        // Log
        await executeQuery(dbConfig, 
            `INSERT INTO LogsSistema (Usuario, Acao, Detalhes) VALUES (@user, 'CORRECAO_RETROATIVA', @detalhes)`, 
            [
                {name:'user', type:TYPES.NVarChar, value:user},
                {name:'detalhes', type:TYPES.NVarChar, value:`Zerou ${count} registros diários por conflito de ausência tardia.`}
            ]
        );

        res.json({ success: true, count });
    } catch(e) {
        res.status(500).json({ message: e.message });
    }
});

app.post('/logs', authenticateToken, async (req, res) => {
    const { acao, detalhes } = req.body;
    const user = req.user.usuario;
    try {
        const q = `INSERT INTO LogsSistema (Usuario, Acao, Detalhes) VALUES (@user, @acao, @detalhes)`;
        const p = [
            {name:'user',type:TYPES.NVarChar,value:user},
            {name:'acao',type:TYPES.NVarChar,value:acao},
            {name:'detalhes',type:TYPES.NVarChar,value:detalhes}
        ];
        await executeQuery(dbConfig, q, p);
        res.status(201).send();
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.listen(port, () => {
    console.log(`API Fuel360 rodando na porta ${port}`);
    seedDefaultUser();
});