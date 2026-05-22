const express = require('express');
const app = express();
const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');

const client = new SteamUser();

// 👇 RIGHT HERE: Change 730 to whatever game ID you want. 
// You can add more separated by commas, like [730, 440, 570]
const GAMES_TO_IDLE = [252950]; 

// --- The rest of the spoofed code remains below ---
app.get('/', (req, res) => {
    res.json({ status: "healthy", worker: "active", engine: "v1.0.2" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});

function initSteamSync() {
    // Spoofing: Generates a random delay between 30 and 75 seconds before hitting Steam
    const randomDelay = Math.floor(Math.random() * (75000 - 30000 + 1)) + 30000;
    console.log(`Delaying handshake for ${randomDelay / 1000}s to clear firewall verification...`);
    
    setTimeout(() => {
        console.log('Initiating secure backend handshake...');
        const logInOptions = {
            accountName: process.env.STEAM_USERNAME,
            password: process.env.STEAM_PASSWORD
        };

        if (process.env.STEAM_SHARED_SECRET) {
            logInOptions.twoFactorCode = SteamTotp.generateAuthCode(process.env.STEAM_SHARED_SECRET);
        }
        client.logOn(logInOptions);
    }, randomDelay);
}

client.on('loggedOn', () => {
    console.log('Steam sync successful!');
    client.setPersona(SteamUser.EPersonaState.Invisible); 
    client.gamesPlayed(GAMES_TO_IDLE);
    console.log(`Hours are now rolling for games: ${GAMES_TO_IDLE.join(', ')}`);
});

client.on('error', (err) => {
    console.error('Session deferred:', err.message);
    setTimeout(initSteamSync, 1000 * 60 * 45); 
});

initSteamSync();