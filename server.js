// Simple development server with auto-reload functionality
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8000;
const WATCH_EXTENSIONS = ['.html', '.css', '.js'];
const clients = new Set();

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon'
};

// File watching setup
function startFileWatcher() {
    const chokidar = spawn('npx', ['chokidar', '**/*.{html,css,js}', '--command', 'node -e "console.log(\'FILE_CHANGED\')"'], {
        stdio: 'pipe',
        cwd: __dirname
    });

    chokidar.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('FILE_CHANGED')) {
            console.log('File changed, notifying clients...');
            notifyClients();
        }
    });

    chokidar.stderr.on('data', (data) => {
        // Ignore chokidar startup messages
        const error = data.toString();
        if (!error.includes('watching') && !error.includes('ready')) {
            console.error('Watcher error:', error);
        }
    });

    return chokidar;
}

// Fallback file watcher using fs.watch (simpler but less reliable)
function startSimpleFileWatcher() {
    const watchedFiles = new Set();
    
    function watchDirectory(dir) {
        try {
            fs.readdirSync(dir).forEach(file => {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory() && file !== 'node_modules' && !file.startsWith('.')) {
                    watchDirectory(fullPath);
                } else if (stat.isFile() && WATCH_EXTENSIONS.some(ext => file.endsWith(ext))) {
                    if (!watchedFiles.has(fullPath)) {
                        watchedFiles.add(fullPath);
                        fs.watchFile(fullPath, { interval: 500 }, () => {
                            console.log(`File changed: ${fullPath}`);
                            setTimeout(() => notifyClients(), 100); // Small delay to batch changes
                        });
                    }
                }
            });
        } catch (err) {
            console.error('Error watching directory:', dir, err);
        }
    }
    
    watchDirectory(__dirname);
    console.log(`Watching ${watchedFiles.size} files for changes...`);
}

function notifyClients() {
    clients.forEach(client => {
        try {
            client.write('data: reload\n\n');
        } catch (err) {
            clients.delete(client);
        }
    });
}

function serveFile(filePath, res) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }

        const ext = path.extname(filePath);
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        
        res.writeHead(200, { 
            'Content-Type': mimeType,
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin'
        });
        
        // Inject auto-reload script into HTML files
        if (ext === '.html') {
            const htmlContent = data.toString();
            const reloadScript = `
<script>
(function() {
    const eventSource = new EventSource('/dev-reload-sse');
    eventSource.onmessage = function(event) {
        if (event.data === 'reload') {
            console.log('🔄 Files changed, reloading page...');
            window.location.reload();
        }
    };
    eventSource.onerror = function() {
        console.log('❌ Auto-reload connection lost');
        eventSource.close();
        // Try to reconnect after 2 seconds
        setTimeout(() => window.location.reload(), 2000);
    };
    console.log('✅ Auto-reload enabled');
})();
</script>`;
            
            // Inject before closing body tag, or at end if no body tag
            const modifiedHtml = htmlContent.includes('</body>') 
                ? htmlContent.replace('</body>', reloadScript + '\n</body>')
                : htmlContent + reloadScript;
            
            res.end(modifiedHtml);
        } else {
            res.end(data);
        }
    });
}

const server = http.createServer((req, res) => {
    // Handle Server-Sent Events endpoint
    if (req.url === '/dev-reload-sse') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        
        clients.add(res);
        
        // Send initial connection message
        res.write('data: connected\n\n');
        
        // Clean up on client disconnect
        req.on('close', () => {
            clients.delete(res);
        });
        
        return;
    }

    // Serve static files
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);

    // Security check - don't serve files outside project directory
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    serveFile(filePath, res);
});

server.listen(PORT, () => {
    console.log(`🚀 Development server running at http://localhost:${PORT}`);
    console.log('📁 Serving files from:', __dirname);
    
    // Try to use chokidar for better file watching, fallback to fs.watch
    try {
        startFileWatcher();
        console.log('👀 Using chokidar for file watching (better performance)');
    } catch (err) {
        console.log('⚠️  Chokidar not available, using fallback file watcher');
        startSimpleFileWatcher();
    }
    
    console.log('✨ Auto-reload enabled - your page will refresh when files change!');
});

process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    server.close(() => {
        process.exit(0);
    });
});