const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');

console.log("Starting WhatsApp authentication...");

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "dvt1-voter-auth" }),
    puppeteer: {
        handleSIGINT: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log("===QR_CODE_START===");
    console.log(qr);
    console.log("===QR_CODE_END===");
});

client.on('ready', () => {
    console.log("===SUCCESS_READY===");
    console.log("Successfully authenticated and synced!");
    process.exit(0);
});

client.on('disconnected', (reason) => {
    console.log("Disconnected: ", reason);
});

client.initialize();
