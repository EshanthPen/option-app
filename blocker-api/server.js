const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const HOSTS_PATH = '/etc/hosts';
const APP_TAG_START = '# --- OPTION APP BLOCKER START ---';
const APP_TAG_END = '# --- OPTION APP BLOCKER END ---';

// Utility to clear existing blocks
const clearExistingBlocks = (content) => {
    const lines = content.split('\n');
    const newLines = [];
    let inBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(APP_TAG_START)) {
            inBlock = true;
            continue;
        }
        if (line.includes(APP_TAG_END)) {
            inBlock = false;
            continue;
        }
        if (!inBlock) {
            newLines.push(line);
        }
    }

    // remove trailing newlines to keep it clean, but ensure it ends with one
    while (newLines.length > 0 && newLines[newLines.length - 1].trim() === '') {
        newLines.pop();
    }
    newLines.push(''); 

    return newLines.join('\n');
};

app.post('/block', (req, res) => {
    try {
        const domains = req.body.domains;
        if (!Array.isArray(domains)) {
            return res.status(400).json({ error: 'Domains must be an array' });
        }

        console.log(`Blocking domains: ${domains.join(', ')}`);

        // Check write permission
        try {
            fs.accessSync(HOSTS_PATH, fs.constants.W_OK);
        } catch (err) {
            return res.status(403).json({ error: 'Permission denied. You must run this server with sudo.' });
        }

        const currentHosts = fs.readFileSync(HOSTS_PATH, 'utf8');
        const cleanedHosts = clearExistingBlocks(currentHosts);

        if (domains.length === 0) {
            fs.writeFileSync(HOSTS_PATH, cleanedHosts, 'utf8');
             // Flush DNS cache on Mac to ensure immediate effect
             exec('sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder');
            return res.json({ success: true, message: 'Blocks cleared (empty array provided).' });
        }


        let blockText = `\n${APP_TAG_START}\n`;
        domains.forEach(domain => {
            domain = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''); // clean up URL to bare domain
            if (domain) {
                blockText += `127.0.0.1 ${domain}\n`;
                blockText += `127.0.0.1 www.${domain}\n`;
            }
        });
        blockText += `${APP_TAG_END}\n`;

        fs.writeFileSync(HOSTS_PATH, cleanedHosts + blockText, 'utf8');

        // Flush DNS cache on Mac to ensure immediate effect
        exec('sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder');

        res.json({ success: true, message: 'Domains blocked successfully' });

    } catch (error) {
        console.error('Error blocking domains:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/unblock', (req, res) => {
    try {
        console.log(`Unblocking all domains`);
        // Check write permission
        try {
            fs.accessSync(HOSTS_PATH, fs.constants.W_OK);
        } catch (err) {
            return res.status(403).json({ error: 'Permission denied. You must run this server with sudo.' });
        }

        const currentHosts = fs.readFileSync(HOSTS_PATH, 'utf8');
        const cleanedHosts = clearExistingBlocks(currentHosts);

        fs.writeFileSync(HOSTS_PATH, cleanedHosts, 'utf8');

        // Flush DNS cache on Mac to ensure immediate effect
        exec('sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder');

        res.json({ success: true, message: 'All domains unblocked successfully' });

    } catch (error) {
         console.error('Error unblocking domains:', error);
         res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Blocker API Server listening on port ${PORT}`);
    console.log(`IMPORTANT: Ensure you ran this with 'sudo node server.js' to edit /etc/hosts`);
});
