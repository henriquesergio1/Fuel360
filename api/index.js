
// ... (código anterior mantido)

// --- ROTEIRIZADOR (ATUALIZADO) ---
app.get('/roteiro/previsao', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Se não vier datas, define o mês atual como fallback
        let dateStart = startDate;
        let dateEnd = endDate;

        if (!dateStart || !dateEnd) {
            const now = new Date();
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            dateStart = firstDay.toISOString().split('T')[0];
            dateEnd = lastDay.toISOString().split('T')[0];
        }

        const query = `
            DECLARE @DataInicio DATE = @pStartDate;
            DECLARE @DataFim DATE = @pEndDate;

            -- Gera a lista de datas dentro do intervalo selecionado pelo usuário
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
            INNER JOIN FLEXX10071188.dbo.IBETCPLEPG epg 
                ON epg.CODMTCEPG = e.CODMTCEPGVDD
            LEFT JOIN FLEXX10071188.dbo.IBETSBN sbn 
                ON sbn.CODMTCEPGSBN = epg.CODMTCEPG
            LEFT JOIN FLEXX10071188.dbo.IBETCPLEPG sup 
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

        const { rows } = await executeQuery(dbConfig, query, params);
        res.json(rows);
    } catch (e) {
        console.error("Erro no roteirizador:", e);
        res.status(500).json({ message: "Erro ao calcular rotas previstas: " + e.message });
    }
});

// ... (resto do arquivo)
