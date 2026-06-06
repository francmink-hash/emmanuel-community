const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 8080;

// Charger .env minimaliste si présent (pas de dépendances externes)
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split(/\r?\n/).forEach(line => {
            const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
            if (match) {
                const key = match[1];
                let val = match[2] || '';
                // Remove optional surrounding quotes
                if ((val.startsWith("\'") && val.endsWith("\'")) || (val.startsWith('"') && val.endsWith('"'))) {
                    val = val.slice(1, -1);
                }
                if (!process.env[key]) process.env[key] = val;
            }
        });
    }
} catch (e) {
    console.warn('Impossible de charger .env', e);
}

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Chemin vers le fichier data-tontine.json (dans le même dossier)
const DATA_FILE_PATH = path.join(__dirname, 'data-tontine.json');

const server = http.createServer((req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    
    // API Endpoints pour data-tontine.json
    if (req.url === '/api/data-tontine' && req.method === 'GET') {
        fs.readFile(DATA_FILE_PATH, 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    // Si le fichier n'existe pas, retourner un objet vide
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({
                        nomAsso: '',
                        explicationAsso: '',
                        sessionActuelle: 1,
                        reunionActuelle: 1,
                        membres: [],
                        comptabilite: {},
                        depenses: [],
                        reunionsHistorique: [],
                        config_caisses: [],
                        config_amendes: [],
                        reglement_interieur: "Le règlement intérieur de l'association n'a pas encore été rédigé par l'Administrateur."
                    }), 'utf-8');
                } else {
                    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({ error: 'Erreur de lecture du fichier' }), 'utf-8');
                }
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(data, 'utf-8');
            }
        });
        return;
    }
    
    // Proxy JSONBin simple sécurisé via .env : GET -> lire la bin, POST -> écrire la bin
    if (req.url === '/api/jsonbin' && req.method === 'GET') {
        const BIN = process.env.JSONBIN_BIN_ID;
        const READ_KEY = process.env.JSONBIN_READ_KEY;
        if (!BIN || !READ_KEY) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'JSONBin non configuré' }));
            return;
        }
        const options = {
            hostname: 'api.jsonbin.io',
            path: `/v3/b/${BIN}/latest`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Bin-Key': READ_KEY
            }
        };
        const proxyReq = https.request(options, proxyRes => {
            let data = '';
            proxyRes.on('data', chunk => data += chunk);
            proxyRes.on('end', () => {
                res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(data);
            });
        });
        proxyReq.on('error', err => {
            res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Proxy JSONBin GET failed', detail: err.message }));
        });
        proxyReq.end();
        return;
    }

    if (req.url === '/api/jsonbin' && req.method === 'POST') {
        const BIN = process.env.JSONBIN_BIN_ID;
        const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
        if (!BIN || !MASTER_KEY) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'JSONBin non configuré' }));
            return;
        }
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const options = {
                hostname: 'api.jsonbin.io',
                path: `/v3/b/${BIN}`,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': MASTER_KEY,
                    'X-Bin-Versioning': 'false'
                }
            };
            const proxyReq = https.request(options, proxyRes => {
                let data = '';
                proxyRes.on('data', chunk => data += chunk);
                proxyRes.on('end', () => {
                    res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(data);
                });
            });
            proxyReq.on('error', err => {
                res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Proxy JSONBin POST failed', detail: err.message }));
            });
            proxyReq.write(body);
            proxyReq.end();
        });
        return;
    }
    
    if (req.url === '/api/data-tontine' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                fs.writeFile(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf8', (err) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ error: 'Erreur d\'écriture du fichier' }), 'utf-8');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ success: true }), 'utf-8');
                    }
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'JSON invalide' }), 'utf-8');
            }
        });
        return;
    }
    
    // OPTIONS pour CORS
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }
    
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }
    
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`, 'utf-8');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`EMMANUEL TONTINE Server`);
    console.log(`Running at http://localhost:${PORT}`);
    console.log(`Press Ctrl+C to stop the server`);
    console.log(`========================================\n`);
});
